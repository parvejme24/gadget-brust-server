const mongoose = require('mongoose');
const InvoiceModel = require('./invoice.model');
const CouponModel = require('../coupon/coupon.model');
const UserModel = require('../user/user.model');
const ResponseUtil = require('../../shared/utils/response.util');
const { isStaff, hasPermission } = require('../../shared/config/permissions');
const CourierModel = require('../courier/courier.model');
const { notify } = require('../notification/notification.service');
const { isMethodEnabled } = require('../payment/orderPayment.controller');
const {
  populateOrder,
  nextInvoiceNumber,
  quoteOrder,
  changeStatus,
  replaceItems,
  recalculate,
  pushHistory,
} = require('./invoice.service');

const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idOf = (v) => String(v?._id || v || '');

// 400s raised by the order service carry statusCode
const handle = (res, next, error) =>
  error.statusCode === 400 ? ResponseUtil.badRequest(res, error.message) : next(error);

const readAddress = (a = {}) => ({
  street: clean(a.street),
  city: clean(a.city, 80),
  state: clean(a.state, 80),
  zipCode: clean(a.zipCode, 20),
  country: clean(a.country, 80) || 'Bangladesh',
});

// customer details + address from a checkout/edit form; returns an error message or the cleaned values
const readContact = (body) => {
  const customer = {
    name: clean(body.customer?.name, 100),
    phone: clean(body.customer?.phone, 20).replace(/[\s-]/g, ''),
    email: clean(body.customer?.email, 120).toLowerCase(),
  };
  const shippingAddress = readAddress(body.shippingAddress);
  if (!customer.name) return { error: 'Enter your full name' };
  if (!BD_PHONE.test(customer.phone)) return { error: 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX)' };
  if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) return { error: 'Enter a valid email address' };
  if (!shippingAddress.street || !shippingAddress.city) return { error: 'Enter your delivery address and city' };
  return { customer, shippingAddress };
};

// staff whose role works with orders may open any order
const seesAllOrders = (user) => ['orders', 'reports', 'customers', 'pos'].some((p) => hasPermission(user.role, p));
// a customer may only open their own orders
const canView = (user, invoice) => seesAllOrders(user) || idOf(invoice.user_id) === String(user.userId);

// add the checkout address to the customer's address book unless the same street + city is saved
const rememberAddress = async (userId, { customer, shippingAddress }) => {
  const user = await UserModel.findById(userId).select('addresses');
  if (!user) return;
  const same = (a) =>
    a.street.trim().toLowerCase() === shippingAddress.street.toLowerCase() && a.city.trim().toLowerCase() === shippingAddress.city.toLowerCase();
  if (user.addresses.some(same) || user.addresses.length >= 10) return;
  user.addresses.push({
    label: user.addresses.length ? 'Other' : 'Home',
    name: customer.name,
    phone: customer.phone,
    street: shippingAddress.street,
    city: shippingAddress.city,
    zipCode: shippingAddress.zipCode,
    isDefault: !user.addresses.length,
  });
  await user.save();
};

class InvoiceController {
  // POST /checkout: price the cart exactly as checkout will (no order is created)
  async quote(req, res, next) {
    try {
      const { items, shippingMethod, couponCode } = req.body;
      const q = await quoteOrder({ items, shippingMethod, couponCode, userId: req.user?.userId });
      return ResponseUtil.success(
        res,
        {
          items: q.lines.map((l) => ({ product: l.product._id, title: l.product.title, price: l.unitPrice, qty: l.qty, lineTotal: l.lineTotal })),
          subtotal: q.subtotal,
          discount: q.discount,
          coupon: q.coupon ? { code: q.coupon.code, title: q.coupon.title } : null,
          shippingCharge: q.shippingCharge,
          shippingMethod: { id: q.shipping._id, name: q.shipping.name },
          total: q.total,
        },
        'Order total'
      );
    } catch (error) {
      handle(res, next, error);
    }
  }

  // Place an online order. Guests need no account; signed-in customers are linked to it.
  // Staff use the same endpoint to add a phone/manual order (optionally for an existing customer).
  async checkout(req, res, next) {
    try {
      const contact = readContact(req.body);
      if (contact.error) return ResponseUtil.badRequest(res, contact.error);

      const paymentMethod = req.body.paymentMethod || 'cash_on_delivery';
      if (!isMethodEnabled(paymentMethod)) return ResponseUtil.badRequest(res, 'Choose an available payment method');

      const staff = req.user && isStaff(req.user.role);
      let userId = req.user && !staff ? req.user.userId : undefined;
      if (staff && req.body.customer?.userId) {
        if (!mongoose.isValidObjectId(req.body.customer.userId)) return ResponseUtil.badRequest(res, 'Invalid customer');
        userId = req.body.customer.userId;
      }

      const q = await quoteOrder({
        items: req.body.items,
        shippingMethod: req.body.shippingMethod,
        couponCode: req.body.couponCode,
        userId,
      });

      const now = new Date();
      const invoice = await InvoiceModel.create({
        user_id: userId,
        customer: contact.customer,
        phone: contact.customer.phone,
        source: 'online',
        invoiceNumber: await nextInvoiceNumber(),
        orderDate: now,
        dueDate: new Date(now.getTime() + 7 * 86400000),
        items: q.lines.map((l) => ({ product: l.product._id, title: l.product.title, image: l.product.image?.url, price: l.unitPrice, qty: l.qty })),
        subtotal: q.subtotal,
        discount: q.discount,
        coupon: q.coupon ? { code: q.coupon.code, discount: q.discount } : undefined,
        tax: 0,
        shippingMethod: { id: q.shipping._id, name: q.shipping.name },
        shippingCharge: q.shippingCharge,
        total: q.total,
        paymentMethod,
        shippingAddress: contact.shippingAddress,
        billingAddress: contact.shippingAddress,
        notes: clean(req.body.notes, 500),
        statusHistory: [{ status: 'pending', note: staff ? 'Added by staff' : '', by: req.user?.userId, at: now }],
      });

      // signed-in customers can keep the address for next time (body.saveAddress)
      if (userId && !staff && req.body.saveAddress) await rememberAddress(userId, contact);

      if (q.coupon) {
        await CouponModel.updateOne(
          { _id: q.coupon._id },
          { $inc: { usedCount: 1 }, $push: { redemptions: { user: userId, invoice: invoice._id, discount: q.discount } } }
        );
      }

      await notify({
        type: 'order.new',
        permission: 'orders',
        title: `New ${userId ? '' : 'guest '}order ${invoice.invoiceNumber}`,
        message: `${contact.customer.name} · ৳${invoice.total.toLocaleString('en-IN')} · ${invoice.items.length} item${invoice.items.length > 1 ? 's' : ''}`,
        link: `/dashboard/orders/${invoice._id}`,
      });

      return ResponseUtil.created(
        res,
        { _id: invoice._id, invoiceNumber: invoice.invoiceNumber, total: invoice.total, phone: invoice.phone, paymentMethod: invoice.paymentMethod, isGuest: !userId },
        'Order placed'
      );
    } catch (error) {
      handle(res, next, error);
    }
  }

  // public order tracking: GET /track?number=INV-...&phone=01...
  async track(req, res, next) {
    try {
      const number = clean(req.query.number, 40).toUpperCase();
      const phone = clean(req.query.phone, 20).replace(/[\s-]/g, '');
      if (!number || !phone) return ResponseUtil.badRequest(res, 'Enter your order number and phone number');

      const last10 = phone.slice(-10);
      const invoice = await InvoiceModel.findOne({ invoiceNumber: number })
        .populate('shipment.courier', 'name trackingUrl phone')
        .lean();
      const phones = [invoice?.phone, invoice?.customer?.phone].filter(Boolean).map((p) => p.replace(/[\s-]/g, '').slice(-10));
      if (!invoice || last10.length < 10 || !phones.includes(last10)) {
        return ResponseUtil.notFound(res, "We couldn't find an order with that number and phone");
      }

      return ResponseUtil.success(
        res,
        {
          invoiceNumber: invoice.invoiceNumber,
          orderDate: invoice.orderDate,
          orderStatus: invoice.orderStatus,
          paymentStatus: invoice.paymentStatus,
          paymentMethod: invoice.paymentMethod,
          items: invoice.items.map(({ title, image, price, qty }) => ({ title, image, price, qty })),
          subtotal: invoice.subtotal,
          discount: invoice.discount,
          shippingCharge: invoice.shippingCharge,
          total: invoice.total,
          city: invoice.shippingAddress?.city,
          statusHistory: (invoice.statusHistory || []).map(({ status, note, at }) => ({ status, note, at })),
          shipment: invoice.shipment?.courier
            ? {
                courier: invoice.shipment.courier.name,
                phone: invoice.shipment.courier.phone,
                trackingNumber: invoice.shipment.trackingNumber,
                trackingUrl: invoice.shipment.courier.trackingUrl,
                shippedAt: invoice.shipment.shippedAt,
              }
            : null,
        },
        'Order found'
      );
    } catch (error) {
      next(error);
    }
  }

  // ?status&paymentStatus&orderStatus&userId&source=online|pos&guest=true&q=
  async getAllInvoices(req, res, next) {
    try {
      const { userId, status, paymentStatus, orderStatus, source, guest, q } = req.query;

      const filters = {};
      if (userId) filters.user_id = userId;
      if (status) filters.status = status;
      if (paymentStatus) filters.paymentStatus = paymentStatus;
      if (orderStatus) filters.orderStatus = orderStatus;
      if (source) filters.source = source;
      if (guest === 'true') Object.assign(filters, { source: 'online', user_id: null });
      if (q) {
        const rx = new RegExp(escape(clean(q, 60)), 'i');
        filters.$or = [{ invoiceNumber: rx }, { 'customer.name': rx }, { 'customer.phone': rx }, { phone: rx }];
      }

      const invoices = await populateOrder(InvoiceModel.find(filters)).sort({ createdAt: -1 });
      return ResponseUtil.success(res, invoices, 'Invoices retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceById(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return ResponseUtil.notFound(res, 'Invoice not found');
      const invoice = await populateOrder(InvoiceModel.findById(req.params.id));
      if (!invoice) return ResponseUtil.notFound(res, 'Invoice not found');
      if (!canView(req.user, invoice)) return ResponseUtil.forbidden(res, 'You can only view your own orders');
      return ResponseUtil.success(res, invoice, 'Invoice retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // the signed-in customer's orders
  async getMyInvoices(req, res, next) {
    try {
      const invoices = await populateOrder(InvoiceModel.find({ user_id: req.user.userId })).sort({ createdAt: -1 });
      return ResponseUtil.success(res, invoices, 'Your orders');
    } catch (error) {
      next(error);
    }
  }

  async getUserInvoices(req, res, next) {
    try {
      const { userId } = req.params;
      if (!seesAllOrders(req.user) && userId !== String(req.user.userId)) {
        return ResponseUtil.forbidden(res, 'You can only view your own orders');
      }
      const invoices = await populateOrder(InvoiceModel.find({ user_id: userId })).sort({ createdAt: -1 });
      return ResponseUtil.success(res, invoices, 'User invoices retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // Staff edit: { items?, customer?, shippingAddress?, shippingCharge?, discount?, notes? }
  async editOrder(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return ResponseUtil.notFound(res, 'Invoice not found');
      const invoice = await InvoiceModel.findById(req.params.id);
      if (!invoice) return ResponseUtil.notFound(res, 'Invoice not found');

      const body = req.body;
      const changes = [];

      if (body.items !== undefined) {
        if (invoice.source === 'pos') return ResponseUtil.badRequest(res, "Counter (POS) sales can't have their items changed");
        if (invoice.orderStatus === 'cancelled') return ResponseUtil.badRequest(res, 'Reopen the order before changing its items');
        await replaceItems(invoice, body.items, req.user.userId);
        changes.push('items');
      }
      if (body.customer !== undefined || body.shippingAddress !== undefined) {
        const contact = readContact({
          customer: { ...invoice.customer?.toObject?.(), phone: invoice.phone, ...body.customer },
          shippingAddress: { ...invoice.shippingAddress?.toObject?.(), ...body.shippingAddress },
        });
        if (contact.error) return ResponseUtil.badRequest(res, contact.error);
        invoice.customer = contact.customer;
        invoice.phone = contact.customer.phone;
        invoice.shippingAddress = contact.shippingAddress;
        changes.push('customer details');
      }
      if (body.userId !== undefined) {
        if (body.userId && !(await UserModel.exists({ _id: body.userId }))) return ResponseUtil.badRequest(res, 'Customer not found');
        invoice.user_id = body.userId || undefined;
        changes.push('linked account');
      }
      if (body.shippingCharge !== undefined) {
        const charge = Math.round(Number(body.shippingCharge));
        if (!(charge >= 0)) return ResponseUtil.badRequest(res, 'Delivery charge must be 0 or more');
        invoice.shippingCharge = charge;
        changes.push('delivery charge');
      }
      if (body.discount !== undefined) {
        const discount = Math.round(Number(body.discount));
        if (!(discount >= 0)) return ResponseUtil.badRequest(res, 'Discount must be 0 or more');
        invoice.discount = discount;
        changes.push('discount');
      }
      if (body.notes !== undefined) {
        invoice.notes = clean(body.notes, 500);
        changes.push('notes');
      }
      if (!changes.length) return ResponseUtil.badRequest(res, 'Nothing to update');

      await recalculate(invoice);
      pushHistory(invoice, invoice.orderStatus, {
        user: await UserModel.findById(req.user.userId).select('fullName'),
        note: `Edited ${changes.join(', ')}`,
      });
      await invoice.save();

      const populated = await populateOrder(InvoiceModel.findById(invoice._id));
      return ResponseUtil.success(res, populated, 'Order updated');
    } catch (error) {
      handle(res, next, error);
    }
  }

  async deleteInvoice(req, res, next) {
    try {
      const invoice = await InvoiceModel.findById(req.params.id);
      if (!invoice) return ResponseUtil.notFound(res, 'Invoice not found');
      // return held stock so deleting an accepted order doesn't lose units
      if (invoice.stockDeducted && invoice.source !== 'pos') await changeStatus(invoice, 'cancelled', { userId: req.user.userId, note: 'Deleted' });
      await InvoiceModel.deleteOne({ _id: invoice._id });
      return ResponseUtil.success(res, null, 'Invoice deleted successfully');
    } catch (error) {
      handle(res, next, error);
    }
  }

  async updateInvoiceStatus(req, res, next) {
    try {
      const { status } = req.body;
      if (!['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
        return ResponseUtil.badRequest(res, 'Invalid status');
      }
      const invoice = await populateOrder(InvoiceModel.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true }));
      if (!invoice) return ResponseUtil.notFound(res, 'Invoice not found');
      return ResponseUtil.success(res, invoice, 'Invoice status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // { orderStatus, note? }: accepting takes stock, cancelling returns it
  async updateOrderStatus(req, res, next) {
    try {
      const invoice = await InvoiceModel.findById(req.params.id);
      if (!invoice) return ResponseUtil.notFound(res, 'Invoice not found');
      await changeStatus(invoice, req.body.orderStatus, { userId: req.user.userId, note: req.body.note });
      const populated = await populateOrder(InvoiceModel.findById(invoice._id));
      return ResponseUtil.success(res, populated, 'Order status updated successfully');
    } catch (error) {
      handle(res, next, error);
    }
  }

  // assign a courier + tracking number; optionally marks the order as shipped
  async updateShipment(req, res, next) {
    try {
      const { courier, trackingNumber = '', note = '', markShipped = true } = req.body;
      if (!courier) return ResponseUtil.badRequest(res, 'Choose a courier');
      if (!mongoose.isValidObjectId(courier) || !(await CourierModel.exists({ _id: courier, isActive: true }))) {
        return ResponseUtil.badRequest(res, 'Choose an active courier');
      }

      const invoice = await InvoiceModel.findById(req.params.id);
      if (!invoice) return ResponseUtil.notFound(res, 'Invoice not found');
      if (invoice.orderStatus === 'cancelled') return ResponseUtil.badRequest(res, 'Cancelled orders cannot be shipped');

      invoice.shipment = {
        courier,
        trackingNumber: clean(trackingNumber, 60),
        note: clean(note, 300),
        shippedAt: invoice.shipment?.shippedAt || new Date(),
      };
      if (markShipped && ['pending', 'processing'].includes(invoice.orderStatus)) {
        await changeStatus(invoice, 'shipped', { userId: req.user.userId, note: note || 'Handed to courier' });
      } else {
        await invoice.save();
      }

      const populated = await populateOrder(InvoiceModel.findById(invoice._id));
      return ResponseUtil.success(res, populated, 'Shipment updated successfully');
    } catch (error) {
      handle(res, next, error);
    }
  }

  async updatePaymentStatus(req, res, next) {
    try {
      const { paymentStatus } = req.body;
      if (!['pending', 'completed', 'failed'].includes(paymentStatus)) {
        return ResponseUtil.badRequest(res, 'Invalid payment status');
      }
      const invoice = await populateOrder(
        InvoiceModel.findByIdAndUpdate(
          req.params.id,
          { paymentStatus, ...(paymentStatus === 'completed' && { status: 'paid' }) },
          { new: true, runValidators: true }
        )
      );
      if (!invoice) return ResponseUtil.notFound(res, 'Invoice not found');
      return ResponseUtil.success(res, invoice, 'Payment status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceSummary(req, res, next) {
    try {
      const { userId } = req.params;
      if (!seesAllOrders(req.user) && userId !== String(req.user.userId)) {
        return ResponseUtil.forbidden(res, 'You can only view your own orders');
      }

      const invoices = await InvoiceModel.find({ user_id: userId });
      const summary = invoices.reduce(
        (acc, invoice) => {
          acc.totalInvoices += 1;
          acc.totalAmount += invoice.total;
          if (invoice.status === 'paid') {
            acc.paidInvoices += 1;
            acc.paidAmount += invoice.total;
          } else if (invoice.status === 'pending') {
            acc.pendingInvoices += 1;
            acc.pendingAmount += invoice.total;
          } else if (invoice.status === 'overdue') {
            acc.overdueInvoices += 1;
            acc.overdueAmount += invoice.total;
          }
          return acc;
        },
        { totalInvoices: 0, totalAmount: 0, paidInvoices: 0, paidAmount: 0, pendingInvoices: 0, pendingAmount: 0, overdueInvoices: 0, overdueAmount: 0 }
      );
      return ResponseUtil.success(res, summary, 'Invoice summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InvoiceController();
