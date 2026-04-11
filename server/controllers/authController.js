const prisma = require("../prismaClient");
const authService = require("../services/authService");
const { createAuditLog } = require("../services/auditService");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { AUDIT_ACTIONS } = require("../utils/constants");

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const { email, password, name, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw ApiError.conflict("Email already registered");

    const hashedPassword = await authService.hashPassword(password);

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: role || "ANALYST" },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const token = authService.generateToken(user);

    await createAuditLog(AUDIT_ACTIONS.USER_REGISTER, "User", user.id, user.id);

    ApiResponse.created({ user, token }, "User registered successfully").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw ApiError.unauthorized("Invalid credentials");

    const validPassword = await authService.comparePassword(password, user.password);
    if (!validPassword) throw ApiError.unauthorized("Invalid credentials");

    if (!user.isActive) throw ApiError.forbidden("Account is deactivated");

    const token = authService.generateToken(user);

    await createAuditLog(AUDIT_ACTIONS.USER_LOGIN, "User", user.id, user.id);

    ApiResponse.success(
      {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
      },
      "Login successful"
    ).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 */
async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    if (!user) throw ApiError.notFound("User not found");

    ApiResponse.success(user).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/auth/profile
 */
async function updateProfile(req, res, next) {
  try {
    const { name, password } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (password) updateData.password = await authService.hashPassword(password);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, updatedAt: true },
    });

    ApiResponse.success(user, "Profile updated").send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login, getMe, updateProfile };
