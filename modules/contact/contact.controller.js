const ContactModel = require("./contact.model");
const ResponseUtil = require("../../shared/utils/response.util");
const { notify } = require("../notification/notification.service");

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
        link: "/dashboard/notifications",
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
      const { status, limit = 50, page = 1 } = req.query;
      const filter = {};
      if (status) filter.status = status;

      const skip = (Number(page) - 1) * Number(limit);
      const [messages, total] = await Promise.all([
        ContactModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
        ContactModel.countDocuments(filter),
      ]);

      return ResponseUtil.success(res, { messages, total, page: Number(page) }, "Messages fetched");
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/contact/:id/status - Update message status
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["unread", "read", "replied", "archived"].includes(status)) {
        return ResponseUtil.badRequest(res, "Invalid status");
      }

      const updated = await ContactModel.findByIdAndUpdate(id, { status }, { new: true });
      if (!updated) return ResponseUtil.notFound(res, "Message not found");

      return ResponseUtil.success(res, updated, "Status updated");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ContactController();
