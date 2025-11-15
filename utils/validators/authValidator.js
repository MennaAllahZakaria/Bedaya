// middlewares/validators/authValidator.js
const Joi = require("joi");
const ApiError = require("../../utils/apiError");

// ---------- helper: run Joi schema ----------
function runSchema(schema, source) {
  const { error, value } = schema.validate(source, { abortEarly: false, stripUnknown: true });
  if (error) {
    const msg = error.details.map(d => d.message).join(", ");
    throw new ApiError(msg, 400);
  }
  return value;
}

// ---------- Schemas ----------
const signupSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(60).required(),
  lastName: Joi.string().trim().min(1).max(60).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(8).max(128).required(),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "confirmPassword does not match password",
  }),
  role: Joi.string().valid("buyer", "seller").default("buyer"),
  preferredLang: Joi.string().valid("en", "ar").optional(),
  phoneNumber: Joi.string().trim().optional().allow(null, ""),
  shopName: Joi.string().trim().optional().allow(null, ""),
  idType: Joi.string().trim().optional().allow(null, ""),
  idNumber: Joi.string().trim().optional().allow(null, ""),
  // categories, workingHours etc. are optional and can be passed later from dashboard
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().required(),
});

const verifyEmailSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  code: Joi.string().trim().length(6).required(),
});

const forgetPasswordSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

const verifyResetCodeSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  code: Joi.string().trim().length(6).required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  newPassword: Joi.string().min(8).max(128).required(),
  confirmNewPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "confirmNewPassword does not match newPassword",
  }),
});

const sellerCardSchema = Joi.object({
  idType: Joi.string().trim().required(),
  idNumber: Joi.string().trim().required(),
  // document file is expected via multer -> attachUploadedLinks -> req.uploads.verificationDocument
});

const updateFcmSchema = Joi.object({
  fcmToken: Joi.string().min(16).max(2000).required(),
});

// ---------- Middlewares ----------

// signup validator
exports.validateSignup = (req, res, next) => {
  try {
    const payload = runSchema(signupSchema, req.body);

    // If role seller and user provided idType/idNumber but didn't upload file, allow but warn?
    // We'll attach the cleaned payload back to req.body for safe use downstream
    req.body = { ...req.body, ...payload };
    return next();
  } catch (err) {
    return next(err);
  }
};

// login validator
exports.validateLogin = (req, res, next) => {
  try {
    req.body = runSchema(loginSchema, req.body);
    return next();
  } catch (err) {
    return next(err);
  }
};

// verify email validator
exports.validateVerifyEmail = (req, res, next) => {
  try {
    req.body = runSchema(verifyEmailSchema, req.body);
    return next();
  } catch (err) {
    return next(err);
  }
};

// forget password
exports.validateForgetPassword = (req, res, next) => {
  try {
    req.body = runSchema(forgetPasswordSchema, req.body);
    return next();
  } catch (err) {
    return next(err);
  }
};

// verify reset code
exports.validateVerifyResetCode = (req, res, next) => {
  try {
    req.body = runSchema(verifyResetCodeSchema, req.body);
    return next();
  } catch (err) {
    return next(err);
  }
};

// reset password
exports.validateResetPassword = (req, res, next) => {
  try {
    req.body = runSchema(resetPasswordSchema, req.body);
    return next();
  } catch (err) {
    return next(err);
  }
};

// seller card submit validator
// expects multer upload to run before, and attachUploadedLinks to populate req.uploads
exports.validateSellerCard = (req, res, next) => {
  try {
    // validate body fields (idType/idNumber)
    const body = runSchema(sellerCardSchema, req.body);

    // require uploaded doc in req.uploads.verificationDocument
    const docUrl = req.uploads && req.uploads.verificationDocument ? req.uploads.verificationDocument : null;
    if (!docUrl) {
      throw new ApiError("Verification document is required (upload file under field 'verificationDocument')", 400);
    }

    // attach cleaned data
    req.body = { ...req.body, ...body };
    req.body.documentUrl = docUrl;
    return next();
  } catch (err) {
    return next(err);
  }
};

// update FCM token validator
exports.validateUpdateFcm = (req, res, next) => {
  try {
    req.body = runSchema(updateFcmSchema, req.body);
    return next();
  } catch (err) {
    return next(err);
  }
};
