const express = require("express");
const {
    signup,
    verifyEmailUser,
    login,
    forgetPassword,
    verifyForgotPasswordCode,
    resetPassword,
    updateFcmToken
} = require("../services/authService");

const {
    validateSignup,
    validateLogin,
    validateVerifyEmail,
    validateForgetPassword,
    validateVerifyResetCode,
    validateResetPassword,
    validateUpdateFcm,


} = require("../utils/validators/authValidator");

const { protect, allowedTo } = require("../middleware/authMiddleware");

const {uploadVerificationDocument, attachUploadedLinks} = require("../middleware/uploadFileMiddleware");
const router = express.Router();
// ================= AUTH =================
// 📌 Signup (send verification email)
router.post("/signup" ,uploadVerificationDocument,attachUploadedLinks, validateSignup, signup);

// 📌 Verify email (create account after code)
router.post("/verifyEmailUser", validateVerifyEmail, verifyEmailUser);
// 📌 Login
router.post("/login",validateLogin, login);
// ================= PASSWORD RESET =================
// 📌 Send reset code
router.post("/forgetPassword",validateForgetPassword, forgetPassword);
// 📌 Verify reset code
router.post("/verifyForgotPasswordCode",validateVerifyResetCode, verifyForgotPasswordCode);
// 📌 Reset password
router.post("/resetPassword",validateResetPassword, resetPassword);
// ================= UPDATE FCM TOKEN =================
router.post("/updateFcmToken",protect, validateUpdateFcm, updateFcmToken);

module.exports = router;