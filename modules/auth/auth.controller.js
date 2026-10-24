const UserModel = require('../user/user.model');
const RefreshTokenModel = require('./auth.model');
const ResponseUtil = require('../../shared/utils/response.util');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ALL_ROLES } = require('../../shared/config/permissions');

class AuthController {
  async register(req, res, next) {
    try {
      const { fullName, email, password } = req.body;

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
        role: 'user'
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

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { userId: user._id },
        process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
        { expiresIn: '7d' }
      );

      // Save refresh token
      await RefreshTokenModel.create({
        userId: user._id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });

      // Remove password from response
      const userResponse = {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      };

      return ResponseUtil.success(res, {
        user: userResponse,
        token,
        refreshToken
      }, 'Login successful');
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
        payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key');
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

      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      return ResponseUtil.success(res, { token }, 'Token refreshed');
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
}

module.exports = new AuthController();
