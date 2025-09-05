const InvoiceModel = require('./invoice.model');
const ResponseUtil = require('../../shared/utils/response.util');

class InvoiceController {
  async createInvoice(req, res, next) {
    try {
      // Generate unique invoice number
      const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const invoiceData = {
        ...req.body,
        invoiceNumber,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      };

      const invoice = new InvoiceModel(invoiceData);
      const savedInvoice = await invoice.save();
      
      // Populate the saved invoice
      const populatedInvoice = await InvoiceModel.findById(savedInvoice._id)
        .populate('user_id', 'fullName email');
      
      return ResponseUtil.created(res, populatedInvoice, 'Invoice created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAllInvoices(req, res, next) {
    try {
      const { userId, status, paymentStatus } = req.query;
      
      let filters = {};
      if (userId) filters.user_id = userId;
      if (status) filters.status = status;
      if (paymentStatus) filters.paymentStatus = paymentStatus;
      
      const invoices = await InvoiceModel.find(filters)
        .populate('user_id', 'fullName email')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, invoices, 'Invoices retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceById(req, res, next) {
    try {
      const { id } = req.params;
      
      const invoice = await InvoiceModel.findById(id)
        .populate('user_id', 'fullName email');
      
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }
      
      return ResponseUtil.success(res, invoice, 'Invoice retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getUserInvoices(req, res, next) {
    try {
      const { userId } = req.params;
      
      const invoices = await InvoiceModel.find({ user_id: userId })
        .populate('user_id', 'fullName email')
        .sort({ createdAt: -1 });
      
      return ResponseUtil.success(res, invoices, 'User invoices retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateInvoice(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const invoice = await InvoiceModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate('user_id', 'fullName email');
      
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }
      
      return ResponseUtil.success(res, invoice, 'Invoice updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteInvoice(req, res, next) {
    try {
      const { id } = req.params;
      
      const invoice = await InvoiceModel.findByIdAndDelete(id);
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }
      
      return ResponseUtil.success(res, null, 'Invoice deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateInvoiceStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
        return ResponseUtil.badRequest(res, 'Invalid status');
      }
      
      const invoice = await InvoiceModel.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
      ).populate('user_id', 'fullName email');
      
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }
      
      return ResponseUtil.success(res, invoice, 'Invoice status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updatePaymentStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { paymentStatus } = req.body;
      
      if (!['pending', 'completed', 'failed'].includes(paymentStatus)) {
        return ResponseUtil.badRequest(res, 'Invalid payment status');
      }
      
      const invoice = await InvoiceModel.findByIdAndUpdate(
        id,
        { paymentStatus },
        { new: true, runValidators: true }
      ).populate('user_id', 'fullName email');
      
      if (!invoice) {
        return ResponseUtil.notFound(res, 'Invoice not found');
      }
      
      return ResponseUtil.success(res, invoice, 'Payment status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceSummary(req, res, next) {
    try {
      const { userId } = req.params;
      
      const invoices = await InvoiceModel.find({ user_id: userId });
      
      const summary = invoices.reduce((acc, invoice) => {
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
      }, {
        totalInvoices: 0,
        totalAmount: 0,
        paidInvoices: 0,
        paidAmount: 0,
        pendingInvoices: 0,
        pendingAmount: 0,
        overdueInvoices: 0,
        overdueAmount: 0
      });
      
      return ResponseUtil.success(res, summary, 'Invoice summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InvoiceController();
