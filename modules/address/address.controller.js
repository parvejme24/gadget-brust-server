const mongoose = require("mongoose");
const UserModel = require("../user/user.model");
const ResponseUtil = require("../../shared/utils/response.util");

const MAX_ADDRESSES = 10;
const FIELDS = ["label", "name", "phone", "street", "city", "zipCode", "note", "isDefault"];
const REQUIRED = ["name", "phone", "street", "city"];
const MAX_DETAILS = 12;

// extra form fields as short strings: { house: "12", road: "5", landmark: "..." }
const cleanDetails = (details) =>
  Object.fromEntries(
    Object.entries(details && typeof details === "object" && !Array.isArray(details) ? details : {})
      .filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key) && ["string", "number"].includes(typeof value))
      .slice(0, MAX_DETAILS)
      .map(([key, value]) => [key, String(value).trim().slice(0, 120)])
  );

const pick = (body) => {
  const out = FIELDS.reduce((acc, key) => {
    if (body[key] === undefined) return acc;
    acc[key] = key === "isDefault" ? Boolean(body[key]) : String(body[key]).trim();
    return acc;
  }, {});
  if (body.details !== undefined) out.details = cleanDetails(body.details);
  return out;
};

const missing = (address) => REQUIRED.filter((key) => !address[key]);

// exactly one default whenever there is at least one address
const keepOneDefault = (user, preferredId) => {
  if (!user.addresses.length) return;
  const target =
    (preferredId && user.addresses.id(preferredId)) || user.addresses.find((a) => a.isDefault) || user.addresses[0];
  user.addresses.forEach((a) => {
    a.isDefault = String(a._id) === String(target._id);
  });
};

const sameAddress = (a, b) =>
  a.street.trim().toLowerCase() === b.street.trim().toLowerCase() && a.city.trim().toLowerCase() === b.city.trim().toLowerCase();

const loadUser = (req) => UserModel.findById(req.user.userId).select("addresses");

const findAddress = (user, id) => (mongoose.isValidObjectId(id) ? user.addresses.id(id) : null);

class AddressController {
  async list(req, res, next) {
    try {
      const user = await loadUser(req);
      if (!user) return ResponseUtil.notFound(res, "User not found");
      return ResponseUtil.success(res, user.addresses, "Your addresses");
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const address = pick(req.body);
      const absent = missing(address);
      if (absent.length) return ResponseUtil.badRequest(res, `Missing: ${absent.join(", ")}`);

      const user = await loadUser(req);
      if (!user) return ResponseUtil.notFound(res, "User not found");

      // checkout saves the address it used, so the same street + city updates instead of duplicating
      const existing = user.addresses.find((a) => sameAddress(a, address));
      if (existing) {
        existing.set(address);
      } else {
        if (user.addresses.length >= MAX_ADDRESSES) {
          return ResponseUtil.badRequest(res, `You can save up to ${MAX_ADDRESSES} addresses`);
        }
        user.addresses.push(address);
      }
      const saved = existing || user.addresses[user.addresses.length - 1];
      keepOneDefault(user, address.isDefault ? saved._id : null);
      await user.save();

      return ResponseUtil.created(res, { address: saved, addresses: user.addresses }, existing ? "Address updated" : "Address saved");
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const user = await loadUser(req);
      if (!user) return ResponseUtil.notFound(res, "User not found");
      const address = findAddress(user, req.params.id);
      if (!address) return ResponseUtil.notFound(res, "Address not found");

      const changes = pick(req.body);
      address.set(changes);
      const absent = missing(address);
      if (absent.length) return ResponseUtil.badRequest(res, `Missing: ${absent.join(", ")}`);
      keepOneDefault(user, changes.isDefault ? address._id : null);
      await user.save();

      return ResponseUtil.success(res, { address, addresses: user.addresses }, "Address updated");
    } catch (error) {
      next(error);
    }
  }

  async remove(req, res, next) {
    try {
      const user = await loadUser(req);
      if (!user) return ResponseUtil.notFound(res, "User not found");
      const address = findAddress(user, req.params.id);
      if (!address) return ResponseUtil.notFound(res, "Address not found");

      address.deleteOne();
      keepOneDefault(user);
      await user.save();

      return ResponseUtil.success(res, user.addresses, "Address removed");
    } catch (error) {
      next(error);
    }
  }

  async setDefault(req, res, next) {
    try {
      const user = await loadUser(req);
      if (!user) return ResponseUtil.notFound(res, "User not found");
      const address = findAddress(user, req.params.id);
      if (!address) return ResponseUtil.notFound(res, "Address not found");

      keepOneDefault(user, address._id);
      await user.save();

      return ResponseUtil.success(res, user.addresses, "Default address updated");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AddressController();
