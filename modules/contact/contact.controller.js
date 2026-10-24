const mongoose = require("mongoose");
const ContactModel = require("./contact.model");
const ResponseUtil = require("../../shared/utils/response.util");
const { notify } = require("../notification/notification.service");

const STATUSES = ["unread", "read", "replied", "archived"];

class ContactController {
  // POST /api/contact - Public contact submission
  async submitMessage(req, res, next) {
    try {
      const { name, email, phone, subject, message } = req.body;

      if (!name || !email || !message) {
        return ResponseUtil.badRequest(res, "Name, email and message are required");
      }

      if (message.trim().length < 10) {
        return ResponseUtil.badRequest(res, "Message must be at least 10 characters long");
      }

      const contact = await ContactModel.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone ? phone.trim() : "",
        subject: subject ? subject.trim() : "General inquiry",
        message: message.trim(),
      });

      // Send staff notification
      await notify({
        type: "system",
        title: `New message from ${contact.name}`,
        message: `${contact.subject}: ${contact.message.slice(0, 80)}${contact.message.length > 80 ? "…" : ""}`,
        link: "/dashboard/messages",
        permission: "dashboard",
      });

      return ResponseUtil.created(res, contact, "Message sent successfully. We will get back to you soon!");
    } catch (error) {
      next(error);
    }
  }

  // GET /api/contact - Staff messages list (admin/manager)
  async getMessages(req, res, next) {
    try {
      const status = STATUSES.includes(req.query.status) ? req.query.status : null;
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const filter = status ? { status } : {};
      if (req.query.search) {
        const text = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = ["name", "email", "subject", "message"].map((field) => ({ [field]: { $regex: text, $options: "i" } }));
      }

      const [messages, total, grouped] = await Promise.all([
        ContactModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        ContactModel.countDocuments(filter),
        ContactModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      ]);
      // per-status totals for the inbox tabs
      const counts = Object.fromEntries(STATUSES.map((s) => [s, grouped.find((g) => g._id === s)?.count || 0]));

      return ResponseUtil.success(res, { messages, total, page, pages: Math.ceil(total / limit), counts }, "Messages fetched");
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/contact/:id/status - Update message status
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!STATUSES.includes(status)) {
        return ResponseUtil.badRequest(res, "Invalid status");
      }

      if (!mongoose.isValidObjectId(id)) return ResponseUtil.notFound(res, "Message not found");
      const updated = await ContactModel.findByIdAndUpdate(id, { status }, { new: true });
      if (!updated) return ResponseUtil.notFound(res, "Message not found");

      return ResponseUtil.success(res, updated, "Status updated");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ContactController();
