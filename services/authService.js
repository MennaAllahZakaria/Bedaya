const bcrypt = require("bcrypt");
const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const Verification = require("../models/verificationModel");
const sendEmail = require("../utils/sendEmail"); 
const ApiError = require("../utils/apiError");
const createToken = require("../utils/createToken"); // JWT
const { encryptToken, decryptToken } = require("../utils/fcmToken");

// ==================== SIGNUP ====================
exports.signup = asyncHandler(async (req, res, next) => {
  const role = (req.body.role || "buyer").toLowerCase();
  const email = req.body.email;

  if (!email) return next(new ApiError("Email is required", 400));
  if (role === "admin") return next(new ApiError("You cannot register as admin", 400));

  // تأكد مبدئياً ما فيش يوزر بنفس الإيميل
  const existing = await User.findOne({ email });
  if (existing) return next(new ApiError("Email already in use", 400));

  // بناء tempUserData بطريقة آمنة (لا نأخذ sellerProfile من req.body مباشرة)
  const allowed = ["firstName", "lastName", "email", "role", "preferredLang", "phoneNumber"];
  const tempUserData = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) tempUserData[key] = req.body[key];
  }

  // hash password لو موجود
  if (req.body.password) {
    const saltRounds = parseInt(process.env.HASH_PASS, 10) || 12;
    tempUserData.password = await bcrypt.hash(req.body.password, saltRounds);
  }

  // إذا الدور seller: جهز sellerProfile لكن بدون أخذ كامل البادئ من body
  if (role === "seller") {
    // shopName مطلوب في الـ schema لذلك نضمن قيمة افتراضية إن لم تُعطَ
    const defaultShopName = `${(tempUserData.firstName || "Seller").trim()} Shop`;
    const shopName = req.body.shopName ? String(req.body.shopName).trim() : defaultShopName;

    // جهز sellerProfile الأساسي (باقي الحقول يملؤها البائع لاحقًا من dashboard)
    const sellerProfile = {
      shopName,
      shopDescription: req.body.shopDescription || null,
      logo: req.body.logo || null,
      coverImage: req.body.coverImage || null,
      categories: Array.isArray(req.body.categories) ? req.body.categories : (req.body.categories ? [req.body.categories] : []),
      address: req.body.address || null,
      workingHours: req.body.workingHours || undefined,
      shippingOptions: req.body.shippingOptions || undefined,
    };

    // لو فيه ملف تحقق مرفوع (attachUploadedLinks لازم شغّال قبل الhandler)
    const docUrl = req.uploads && req.uploads.verificationDocument ? req.uploads.verificationDocument : null;
    const idType = req.body.idType ? String(req.body.idType).trim() : null;
    const idNumber = req.body.idNumber ? String(req.body.idNumber).trim() : null;

    // أضف verificationCard **فقط** لو تم رفع وثيقة (نمنع إنشاء بطاقة ناقصة)
    if (docUrl) {
      sellerProfile.verificationCard = {
        idType: idType || "national_id",
        idNumber: idNumber || "unknown",
        documentUrl: docUrl,
        submittedAt: new Date(),
        status: "submitted",
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: null,
      };
    }

    tempUserData.sellerProfile = sellerProfile;
  }

  // لو الدور buyer: جهز buyerProfile إذا رفعت بيانات عنوان/phone اختياري
  if (role === "buyer") {
    const buyerProfile = {};
    if (req.body.phoneNumber) buyerProfile.phoneNumber = req.body.phoneNumber;
    if (req.body.address) buyerProfile.address = req.body.address; // erwartet object or string handled later
    tempUserData.buyerProfile = Object.keys(buyerProfile).length ? buyerProfile : undefined;
  }

  // احذف أي كود تحقق سابق لنفس الإيميل
  await Verification.deleteMany({ email, type: "emailVerification" });

  // انشاء كود تحقق وهاشه
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expirationTime = Date.now() + 10 * 60 * 1000;
  const hashedCode = await bcrypt.hash(verificationCode, 12);

  const message = `
Hi ${tempUserData.firstName || ""} ${tempUserData.lastName || ""},
Your verification code is:
${verificationCode}
(valid for 10 minutes)
`;

  try {
    await sendEmail({
      Email: email,
      subject: "Email Verification Code",
      message,
    });

    await Verification.create({
      email,
      code: hashedCode,
      expiresAt: new Date(expirationTime),
      type: "emailVerification",
      tempUserData,
    });

    return res.status(200).json({
      status: "success",
      message: "Verification code sent to your email.",
    });
  } catch (err) {
    console.error("signup error:", err);
    return next(new ApiError("Error sending email", 500));
  }
});

// ==================== VERIFY EMAIL ====================
exports.verifyEmailUser = asyncHandler(async (req, res, next) => {
    const { email, code } = req.body;

    const verification = await Verification.findOne({ email, type: "emailVerification" });
    if (!verification) return next(new ApiError("No verification request found", 400));

    if (verification.expiresAt < Date.now()) {
        await Verification.deleteOne({ _id: verification._id });
        return next(new ApiError("Code expired", 400));
    }

    const isMatch = await bcrypt.compare(code, verification.code);
    if (!isMatch) return next(new ApiError("Invalid code", 400));

    // إنشاء اليوزر الحقيقي
    const user = await User.create(verification.tempUserData);

    await Verification.deleteOne({ _id: verification._id });

    if (user.role === "teacher") {
        user.teacherProfile.approvalStatus = "pending";
        try{
            const message = `
            Hi ${user.firstName} ${user.lastName},
            Your account has been created and is pending approval. You will be notified once it is reviewed.
            `;
            await sendEmail({
                Email: user.email,
                subject: "Account Created - Pending Approval",
                message,
            });

        } catch(err){
            return next(new ApiError("Error sending email", 500));
        }
        await user.save();

        return res.status(201).json({
            status: "success",
            message: "Email verified successfully. Your account is pending approval.",
        });
    }

    const token = createToken(user._id);

    res.status(201).json({
        status: "success",
        message: "Email verified successfully",
        token,
        user,
    });
});

// ==================== LOGIN ====================
exports.login = asyncHandler(async (req, res, next) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return next(new ApiError("Incorrect email or password", 401));

    if (user.role === "seller" && user.sellerProfile.verificationCard.status !== "verified") {
        return next(new ApiError("Your account is not approved yet", 403));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return next(new ApiError("Incorrect email or password", 401));

    const token = createToken(user._id);

    res.status(200).json({
        status: "success",
        token,
        user,
    });
});

// ==================== FORGET PASSWORD ====================
exports.forgetPassword = asyncHandler(async (req, res, next) => {
    const email = req.body.email;

    // clear any previous reset requests
    await Verification.deleteMany({ email, type: "passwordReset" });

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expirationTime = Date.now() + 10 * 60 * 1000;

    // Hash the code
    const hashedCode = await bcrypt.hash(resetCode, 12);

    const message = `
    Your password reset code is:
    ${resetCode}
    (valid for 10 minutes)
    `;

    try {
        await sendEmail({
        Email: email,
        subject: "Password Reset Code",
        message,
        });

        await Verification.create({
        email,
        code: hashedCode,
        expiresAt: new Date(expirationTime),
        type: "passwordReset",
        });

        res.status(200).json({
        status: "success",
        message: "Password reset code sent to your email.",
        });
    } catch (err) {
        return next(new ApiError("Error sending email", 500));
    }
});

// ==================== VERIFY FROGOT PASSWORD CODE ====================

exports.verifyForgotPasswordCode = asyncHandler(async (req, res, next) => {
    const { email, code } = req.body;

    const verification = await Verification.findOne({ email, type: "passwordReset" });
    if (!verification) return next(new ApiError("No reset request found", 400));

    if (verification.expiresAt < Date.now()) {
        await Verification.deleteOne({ _id: verification._id });
        return next(new ApiError("Code expired", 400));
    }

    const isMatch = await bcrypt.compare(code, verification.code);
    if (!isMatch) return next(new ApiError("Invalid reset code", 400));

    verification.verified = true;
    await verification.save();

    res.status(200).json({
        status: "success",
        message: "Code verified successfully",
    });
});


// ==================== RESET PASSWORD ====================
exports.resetPassword = asyncHandler(async (req, res, next) => {
const { email, newPassword } = req.body;

    // العثور على سجل إعادة تعيين كلمة المرور
    const verification = await Verification.findOne({ 
        email, 
        type: "passwordReset",
        verified: true  
    });

    if (!verification) return next(new ApiError("No verified reset request found", 400));

    if (verification.expiresAt < Date.now()) {
        await Verification.deleteOne({ _id: verification._id });
        return next(new ApiError("Reset request expired", 400));
    }

    const user = await User.findOne({ email });
    if (!user) return next(new ApiError("User not found", 404));

    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordChangedAt = Date.now();
    await user.save();

    await Verification.deleteOne({ _id: verification._id });

    const token = createToken(user._id);

    res.status(200).json({
        status: "success",
        message: "Password reset successfully",
        token,
    });
});

// ---------------------------------notifications --------------------------------
function isValidFcmToken(token) {
  const fcmTokenRegex = /^[a-zA-Z0-9-_:.]{100,}/;
  return fcmTokenRegex.test(token);
}

// @desc    Update FCM token
// @route   PUT /users/updateFcmToken
// @access  Private/user

exports.updateFcmToken = asyncHandler(async (req, res, next) => {
  const { fcmToken } = req.body;

  // Check if FCM Token is provided and valid
  if (!fcmToken || !isValidFcmToken(fcmToken)) {
    return next(new ApiError("FCM token is invalid", 400));
  }

  // Update FCM Token
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { fcmToken: encryptToken(fcmToken) },
    { new: true }
  );

  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  res.status(200).json({ message: "FCM Token updated successfully." });
});
