// Coupon evaluation shared by the storefront cart and the POS.
// Prices always come from the database, never from the client.
const ProductModel = require("../product/product.model");
const InvoiceModel = require("../invoice/invoice.model");

const unitPrice = (p) => (p.discountPrice && p.discountPrice < p.price ? p.discountPrice : p.price);
const idOf = (v) => String(v?._id || v);

// lines: [{ product: id, qty }] -> [{ product, qty, unitPrice, lineTotal }] using current DB prices
const priceLines = async (lines = []) => {
  const ids = lines.map((l) => l.product).filter(Boolean);
  const products = await ProductModel.find({ _id: { $in: ids } }).select("title price discount discountPrice stock category brand image");
  const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));
  return lines
    .filter((l) => byId[String(l.product)] && Number(l.qty) > 0)
    .map((l) => {
      const product = byId[String(l.product)];
      const qty = Math.floor(Number(l.qty));
      const price = l.price !== undefined && l.allowPriceOverride ? Number(l.price) : unitPrice(product);
      return { product, qty, unitPrice: price, lineTotal: price * qty };
    });
};

const isEligible = (coupon, product) => {
  if (coupon.excludeDiscountedItems && product.discount > 0) return false;
  switch (coupon.appliesTo) {
    case "products":
      return coupon.products.some((id) => idOf(id) === String(product._id));
    case "categories":
      return coupon.categories.some((id) => idOf(id) === idOf(product.category));
    case "brands":
      return coupon.brands.some((id) => idOf(id) === idOf(product.brand));
    default:
      return true;
  }
};

const fail = (message) => ({ valid: false, discount: 0, freeShipping: false, message });

/**
 * Evaluate a coupon against priced lines.
 * Returns { valid, discount, freeShipping, message, eligibleSubtotal, lineDiscounts }
 */
const evaluateCoupon = async (coupon, pricedLines, { userId, now = new Date() } = {}) => {
  if (!coupon) return fail("This coupon code doesn't exist.");
  if (!coupon.isActive) return fail("This coupon is not active.");
  if (coupon.startDate && now < coupon.startDate) return fail("This coupon isn't active yet.");
  if (coupon.endDate && now > coupon.endDate) return fail("This coupon has expired.");
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return fail("This coupon has reached its usage limit.");

  if (userId) {
    const used = coupon.redemptions.filter((r) => idOf(r.user) === String(userId)).length;
    if (coupon.usageLimitPerUser && used >= coupon.usageLimitPerUser) return fail("You've already used this coupon.");
    if (coupon.firstOrderOnly) {
      const previous = await InvoiceModel.countDocuments({ user_id: userId, orderStatus: { $ne: "cancelled" } });
      if (previous > 0) return fail("This coupon is for your first order only.");
    }
  } else if (coupon.firstOrderOnly || coupon.usageLimitPerUser) {
    return fail("Sign in to use this coupon.");
  }

  const subtotal = pricedLines.reduce((s, l) => s + l.lineTotal, 0);
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    return fail(`Add ৳${Math.ceil(coupon.minOrderAmount - subtotal).toLocaleString("en-IN")} more to use this coupon.`);
  }

  const eligible = pricedLines.filter((l) => isEligible(coupon, l.product));
  if (!eligible.length) return fail("This coupon doesn't apply to the items in your cart.");
  const eligibleQty = eligible.reduce((s, l) => s + l.qty, 0);
  if (coupon.minQuantity && eligibleQty < coupon.minQuantity) {
    return fail(`Add at least ${coupon.minQuantity} eligible items to use this coupon.`);
  }
  const eligibleSubtotal = eligible.reduce((s, l) => s + l.lineTotal, 0);

  let discount = 0;
  let freeShipping = false;
  const lineDiscounts = {};

  if (coupon.type === "percentage") {
    discount = (eligibleSubtotal * coupon.value) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  } else if (coupon.type === "fixed") {
    discount = Math.min(coupon.value, eligibleSubtotal);
  } else if (coupon.type === "free_shipping") {
    freeShipping = true;
  } else if (coupon.type === "bogo") {
    // expand eligible units, most expensive first; in every (buy + get) group the cheapest `get` units are discounted
    const { buyQty, getQty, getDiscountPercent } = coupon.bogo;
    const units = eligible
      .flatMap((l) => Array.from({ length: l.qty }, () => ({ id: String(l.product._id), price: l.unitPrice })))
      .sort((a, b) => b.price - a.price);
    const group = buyQty + getQty;
    for (let start = 0; start + group <= units.length; start += group) {
      units.slice(start + buyQty, start + group).forEach((u) => {
        const off = (u.price * getDiscountPercent) / 100;
        discount += off;
        lineDiscounts[u.id] = (lineDiscounts[u.id] || 0) + off;
      });
    }
    if (!discount) return fail(`Add ${group} eligible items to get this offer (buy ${buyQty}, get ${getQty}).`);
  }

  discount = Math.round(Math.min(discount, subtotal));
  return { valid: true, discount, freeShipping, message: "Coupon applied", eligibleSubtotal, lineDiscounts };
};

// short human summary, e.g. "20% off, up to ৳2,000"
const describeCoupon = (c) => {
  const taka = (n) => `৳${Math.round(n).toLocaleString("en-IN")}`;
  if (c.type === "percentage") return `${c.value}% off${c.maxDiscount ? `, up to ${taka(c.maxDiscount)}` : ""}`;
  if (c.type === "fixed") return `${taka(c.value)} off`;
  if (c.type === "free_shipping") return "Free delivery";
  if (c.type === "bogo") {
    const { buyQty, getQty, getDiscountPercent } = c.bogo || {};
    return `Buy ${buyQty} get ${getQty} ${getDiscountPercent >= 100 ? "free" : `${getDiscountPercent}% off`}`;
  }
  return "";
};

module.exports = { priceLines, evaluateCoupon, describeCoupon, unitPrice };
