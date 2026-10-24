const UserModel = require('../user/user.model');
const RefreshTokenModel = require('./auth.model');
const ResponseUtil = require('../../shared/utils/response.util');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const axios = require('axios');
const { ALL_ROLES } = require('../../shared/config/permissions');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../shared/config/jwt');
const { sendMail, isMailConfigured } = require('../../shared/utils/mail.util');

const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

// access + refresh token pair for a signed-in user (login, Google sign-in, password reset)
const issueSession = async (user) => {
  const token = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await RefreshTokenModel.create({
    userId: user._id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });
  return {
    user: { _id: user._id, fullName: user.fullName, email: user.email, role: user.role },
    token,
    refreshToken,
  };
};

class AuthController {
  async register(req, res, next) {
    try {
      const { fullName, email, password } = req.body;
      // optional mobile number, stored without spaces or dashes
      const phone = String(req.body.phone || '').replace(/[\s-]/g, '');
      if (phone && !BD_PHONE.test(phone)) {
        return ResponseUtil.badRequest(res, 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX)');
      }

      // Validate required fields
      if (!fullName || !email || !password) {
        return ResponseUtil.badRequest(res, 'Full name, email, and password are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return ResponseUtil.badRequest(res, 'Please provide a valid email address');
      }

      // Validate password length
      if (password.length < 6) {
        return ResponseUtil.badRequest(res, 'Password must be at least 6 characters long');
      }

      // Check if user already exists
      const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return ResponseUtil.badRequest(res, 'User with this email already exists');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const user = new UserModel({
        fullName,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'user',
        ...(phone && { phone }),
      });

      const savedUser = await user.save();

      // Remove password from response
      const userResponse = {
        _id: savedUser._id,
        fullName: savedUser.fullName,
        email: savedUser.email,
        role: savedUser.role,
        phone: savedUser.phone,
        createdAt: savedUser.createdAt
      };

      return ResponseUtil.created(res, userResponse, 'User registered successfully');
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      // Validate required fields
      if (!email || !password) {
        return ResponseUtil.badRequest(res, 'Email and password are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return ResponseUtil.badRequest(res, 'Please provide a valid email address');
      }

      // Find user by email
      const user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) {
        return ResponseUtil.unauthorized(res, 'Invalid email or password');
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return ResponseUtil.unauthorized(res, 'Invalid email or password');
      }

      if (user.isActive === false) {
        return ResponseUtil.forbidden(res, 'This account has been deactivated. Contact the store admin.');
      }

      return ResponseUtil.success(res, await issueSession(user), 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        // Remove refresh token from database
        await RefreshTokenModel.findOneAndDelete({ token: refreshToken });
      }

      return ResponseUtil.success(res, null, 'Logout successful');
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const userId = req.user.userId; // From JWT token

      const user = await UserModel.findById(userId).select('-password');
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      return ResponseUtil.success(res, user, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const userId = req.user.userId;

      // only name and photo; passwords go through /change-password (which checks the current one)
      const updateData = {};
      if (typeof req.body.fullName === 'string' && req.body.fullName.trim()) updateData.fullName = req.body.fullName.trim();
      if (req.body.profileImage !== undefined) {
        updateData.profileImage = typeof req.body.profileImage === 'string' ? { url: req.body.profileImage } : req.body.profileImage;
      }

      const user = await UserModel.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      return ResponseUtil.success(res, user, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteProfile(req, res, next) {
    try {
      const userId = req.user.userId;

      const user = await UserModel.findByIdAndDelete(userId);
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      // Remove refresh tokens
      await RefreshTokenModel.deleteMany({ userId });

      return ResponseUtil.success(res, null, 'Profile deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAllUsers(req, res, next) {
    try {
      const users = await UserModel.find().select('-password');
      return ResponseUtil.success(res, users, 'Users retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateUserRole(req, res, next) {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!ALL_ROLES.includes(role)) {
        return ResponseUtil.badRequest(res, `Invalid role. Use one of: ${ALL_ROLES.join(', ')}`);
      }
      if (String(userId) === String(req.user.userId)) {
        return ResponseUtil.badRequest(res, "You can't change your own role");
      }

      const user = await UserModel.findByIdAndUpdate(
        userId,
        { role },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      return ResponseUtil.success(res, user, 'User role updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Additional user management methods (admin only)
  async createUser(req, res, next) {
    try {
      const { fullName, email, password, role = 'user', phone } = req.body;
      if (!ALL_ROLES.includes(role)) {
        return ResponseUtil.badRequest(res, 'Invalid role');
      }

      // Validate required fields
      if (!fullName || !email || !password) {
        return ResponseUtil.badRequest(res, 'Full name, email, and password are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return ResponseUtil.badRequest(res, 'Please provide a valid email address');
      }

      // Validate password length
      if (password.length < 6) {
        return ResponseUtil.badRequest(res, 'Password must be at least 6 characters long');
      }

      // Check if user already exists
      const existingUser = await UserModel.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return ResponseUtil.badRequest(res, 'User with this email already exists');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const user = new UserModel({
        fullName,
        email: email.toLowerCase(),
        password: hashedPassword,
        role,
        phone
      });

      const savedUser = await user.save();

      // Remove password from response
      const userResponse = {
        _id: savedUser._id,
        fullName: savedUser.fullName,
        email: savedUser.email,
        role: savedUser.role,
        createdAt: savedUser.createdAt
      };

      return ResponseUtil.created(res, userResponse, 'User created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req, res, next) {
    try {
      const user = await UserModel.findById(req.params.id).select('-password');
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }
      return ResponseUtil.success(res, user, 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req, res, next) {
    try {
      const updateData = {};
      ['fullName', 'phone', 'isActive'].forEach((key) => {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
      });
      if (String(req.params.id) === String(req.user.userId) && updateData.isActive === false) {
        return ResponseUtil.badRequest(res, "You can't deactivate your own account");
      }
      // an admin can reset a staff password
      if (req.body.password) {
        if (String(req.body.password).length < 6) return ResponseUtil.badRequest(res, 'Password must be at least 6 characters long');
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(req.body.password, salt);
      }

      const user = await UserModel.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }
      return ResponseUtil.success(res, user, 'User updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req, res, next) {
    try {
      const user = await UserModel.findByIdAndDelete(req.params.id);
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      // Remove refresh tokens
      await RefreshTokenModel.deleteMany({ userId: req.params.id });

      return ResponseUtil.success(res, null, 'User deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getUserByEmail(req, res, next) {
    try {
      const { email } = req.params;
      const user = await UserModel.findOne({ email: email.toLowerCase() }).select('-password');
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }
      return ResponseUtil.success(res, user, 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
  // Exchange a stored refresh token for a new access token
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return ResponseUtil.badRequest(res, 'Refresh token is required');
      }

      let payload;
      try {
        payload = verifyRefreshToken(refreshToken);
      } catch (error) {
        return ResponseUtil.unauthorized(res, 'Invalid or expired refresh token');
      }

      const stored = await RefreshTokenModel.findOne({ token: refreshToken, userId: payload.userId });
      if (!stored || stored.expiresAt < new Date()) {
        return ResponseUtil.unauthorized(res, 'Invalid or expired refresh token');
      }

      const user = await UserModel.findById(payload.userId);
      if (!user || user.isActive === false) {
        return ResponseUtil.unauthorized(res, 'User no longer exists');
      }

      return ResponseUtil.success(res, { token: signAccessToken(user) }, 'Token refreshed');
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return ResponseUtil.badRequest(res, 'Current and new password are required');
      }
      if (newPassword.length < 6) {
        return ResponseUtil.badRequest(res, 'New password must be at least 6 characters long');
      }

      const user = await UserModel.findById(req.user.userId);
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return ResponseUtil.badRequest(res, 'Current password is incorrect');
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      await user.save();

      return ResponseUtil.success(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  // Step 1 of a password reset: email a 6-digit code. The reply is the same whether or not the
  // email has an account, so it can't be used to find out who is registered.
  async forgotPassword(req, res, next) {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return ResponseUtil.badRequest(res, 'Please provide a valid email address');
      }

      const reply = { emailSent: isMailConfigured() };
      const user = await UserModel.findOne({ email });
      if (user && user.isActive !== false) {
        const code = String(crypto.randomInt(100000, 1000000));
        await UserModel.updateOne(
          { _id: user._id },
          { resetCode: hashCode(code), resetCodeExpires: new Date(Date.now() + RESET_CODE_TTL_MS), resetAttempts: 0 }
        );
        const sent = await sendMail({
          to: email,
          subject: 'Your Gadget Brust password reset code',
          text: `Your password reset code is ${code}. It expires in 10 minutes. If you didn't ask for this, ignore this email.`,
          html: `<p>Your password reset code is</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't ask for this, ignore this email.</p>`,
        });
        // if the email couldn't be sent there is no other way to get the code, so development builds return it
        if (!sent && process.env.NODE_ENV !== 'production') reply.devCode = code;
      }
      return ResponseUtil.success(res, reply, 'If that email has an account, a reset code has been sent');
    } catch (error) {
      next(error);
    }
  }

  // Step 2: check the code, set the new password and sign the user in
  async resetPassword(req, res, next) {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const code = String(req.body.code || '').trim();
      const { newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return ResponseUtil.badRequest(res, 'Email, code and new password are required');
      }
      if (String(newPassword).length < 6) {
        return ResponseUtil.badRequest(res, 'New password must be at least 6 characters long');
      }

      const user = await UserModel.findOne({ email }).select('+resetCode +resetCodeExpires +resetAttempts');
      const invalid = () => ResponseUtil.badRequest(res, 'The code is invalid or has expired');
      if (!user || !user.resetCode || !user.resetCodeExpires || user.resetCodeExpires < new Date()) return invalid();
      if (user.resetAttempts >= RESET_MAX_ATTEMPTS) {
        return ResponseUtil.badRequest(res, 'Too many wrong codes. Request a new one.');
      }
      if (hashCode(code) !== user.resetCode) {
        await UserModel.updateOne({ _id: user._id }, { $inc: { resetAttempts: 1 } });
        return invalid();
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(String(newPassword), salt);
      user.resetCode = undefined;
      user.resetCodeExpires = undefined;
      user.resetAttempts = 0;
      await user.save();
      // sign out every other session
      await RefreshTokenModel.deleteMany({ userId: user._id });

      return ResponseUtil.success(res, await issueSession(user), 'Password reset successfully');
    } catch (error) {
      next(error);
    }
  }

  // Sign in with a Google ID token (from Google Identity Services on web or expo-auth-session in the app).
  // GOOGLE_CLIENT_ID may list several client ids (web, iOS, Android) separated by commas.
  async googleLogin(req, res, next) {
    try {
      const clientIds = (process.env.GOOGLE_CLIENT_ID || '').split(',').map((id) => id.trim()).filter(Boolean);
      if (!clientIds.length) {
        return ResponseUtil.error(res, 'Google sign-in is not configured on the server', 503);
      }
      const { idToken } = req.body;
      if (!idToken) return ResponseUtil.badRequest(res, 'idToken is required');

      let profile;
      try {
        const { data } = await axios.get('https://oauth2.googleapis.com/tokeninfo', { params: { id_token: idToken }, timeout: 8000 });
        profile = data;
      } catch {
        return ResponseUtil.unauthorized(res, 'Invalid Google token');
      }
      if (!clientIds.includes(profile.aud) || String(profile.email_verified) !== 'true' || !profile.email) {
        return ResponseUtil.unauthorized(res, 'Invalid Google token');
      }

      const email = profile.email.toLowerCase();
      let user = await UserModel.findOne({ $or: [{ googleId: profile.sub }, { email }] });
      if (!user) {
        // random password: the account signs in with Google until the user sets one via forgot-password
        const salt = await bcrypt.genSalt(10);
        user = await UserModel.create({
          fullName: profile.name || email.split('@')[0],
          email,
          password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), salt),
          role: 'user',
          googleId: profile.sub,
          profileImage: profile.picture ? { url: profile.picture } : undefined,
        });
      } else if (!user.googleId) {
        user.googleId = profile.sub;
        await user.save();
      }
      if (user.isActive === false) {
        return ResponseUtil.forbidden(res, 'This account has been deactivated. Contact the store admin.');
      }

      return ResponseUtil.success(res, await issueSession(user), 'Login successful');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();