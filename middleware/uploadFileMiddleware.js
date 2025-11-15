// middlewares/upload.js
const multer = require("multer");
const cloudinary = require("../utils/cloudinary"); // expects cloudinary.v2 configured
const streamifier = require("streamifier");
const ApiError = require("../utils/apiError");

// ---------- helper ----------
function pickFileUrlFromResult(result) {
  return (result && (result.secure_url || result.url)) || null;
}

const uploadToCloudinary = (buffer, folder, originalName = "file", resource_type = "auto") =>
  new Promise((resolve, reject) => {
    try {
      const public_id = `${Date.now()}-${String(originalName).split(".")[0].replace(/\s+/g, "_")}`;
      const options = { folder, resource_type, public_id };

      const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      });

      streamifier.createReadStream(buffer).pipe(uploadStream);
    } catch (err) {
      reject(err);
    }
  });

// ---------- file filter ----------
const fileFilter = (req, file, cb) => {
  // Accept images for imageProfile only
  if (file.fieldname === "imageProfile") {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new ApiError("Only image files are allowed for profile image", 400), false);
    }
    return cb(null, true);
  }

  // Accept pdf or images for verificationDocument
  if (file.fieldname === "verificationDocument") {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new ApiError("Verification document must be PDF or image (jpg/png)", 400), false);
    }
    return cb(null, true);
  }

  // reject unknown fields by default
  return cb(new ApiError("Unexpected file field", 400), false);
};

// ---------- multer instance (memory) ----------
const multerInstance = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// ---------- role-check middleware (optional) ----------
exports.ensureSeller = (req, res, next) => {
  if (!req.user) return next(new ApiError("Authentication required", 401));
  if (req.user.role !== "seller") return next(new ApiError("Only sellers can upload verification documents", 403));
  next();
};

// ---------- single upload: verificationDocument ----------
exports.uploadVerificationDocument = [
  // 1) multer single to populate req.file
  multerInstance.single("verificationDocument"),
  // 2) async middleware to upload to Cloudinary (if provided) and set req.uploads.verificationDocument
  async (req, res, next) => {
    try {
      req.uploads = req.uploads || {};

      if (!req.file) {
        // allow proceeding; validator can require the file later if needed
        return next();
      }

      const userId = req.user?._id ? String(req.user._id) : "temp";
      const folder = `seller_cards/${userId}`;
      const originalName = req.file.originalname || "document";
      const result = await uploadToCloudinary(req.file.buffer, folder, originalName, "auto");

      req.uploads.verificationDocument = pickFileUrlFromResult(result);
      req._rawUploadResult = req._rawUploadResult || {};
      req._rawUploadResult.verificationDocument = result; // optional raw result for debugging

      next();
    } catch (err) {
      console.error("uploadVerificationDocument error:", err);
      return next(new ApiError("Failed to upload verification document", 500));
    }
  },
];

// ---------- single upload: profile image ----------
exports.uploadProfileImage = [
  multerInstance.single("imageProfile"),
  async (req, res, next) => {
    try {
      req.uploads = req.uploads || {};

      if (!req.file) return next();

      const userId = req.user?._id ? String(req.user._id) : "temp";
      const folder = `profile_images/${userId}`;
      const originalName = req.file.originalname || "profile";
      const result = await uploadToCloudinary(req.file.buffer, folder, originalName, "image");

      req.uploads.imageProfile = pickFileUrlFromResult(result);
      req._rawUploadResult = req._rawUploadResult || {};
      req._rawUploadResult.imageProfile = result;

      next();
    } catch (err) {
      console.error("uploadProfileImage error:", err);
      return next(new ApiError("Failed to upload profile image", 500));
    }
  },
];

// ---------- multiple fields (imageProfile + verificationDocument) ----------
exports.uploadProfileAndDocument = [
  multerInstance.fields([
    { name: "imageProfile", maxCount: 1 },
    { name: "verificationDocument", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      req.uploads = req.uploads || {};
      req._rawUploadResult = req._rawUploadResult || {};

      // handle verificationDocument if present
      if (req.files && req.files.verificationDocument && req.files.verificationDocument[0]) {
        const file = req.files.verificationDocument[0];
        const userId = req.user?._id ? String(req.user._id) : "temp";
        const folder = `seller_cards/${userId}`;
        const result = await uploadToCloudinary(file.buffer, folder, file.originalname || "document", "auto");
        req.uploads.verificationDocument = pickFileUrlFromResult(result);
        req._rawUploadResult.verificationDocument = result;
      }

      // handle imageProfile if present
      if (req.files && req.files.imageProfile && req.files.imageProfile[0]) {
        const file = req.files.imageProfile[0];
        const userId = req.user?._id ? String(req.user._id) : "temp";
        const folder = `profile_images/${userId}`;
        const result = await uploadToCloudinary(file.buffer, folder, file.originalname || "profile", "image");
        req.uploads.imageProfile = pickFileUrlFromResult(result);
        req._rawUploadResult.imageProfile = result;
      }

      return next();
    } catch (err) {
      console.error("uploadProfileAndDocument error:", err);
      return next(new ApiError("Failed to upload files", 500));
    }
  },
];

// ---------- attach links (backwards-compatible) ----------
exports.attachUploadedLinks = (req, res, next) => {
  try {
    // If upload middlewares above ran, req.uploads already has links.
    // This middleware keeps compatibility with code expecting attachUploadedLinks to run.
    req.uploads = req.uploads || {};

    // if someone used other upload approach and set req.file/req.files with url-like props, try to read them
    if (!req.uploads.verificationDocument) {
      if (req.file && req.file.fieldname === "verificationDocument") {
        // multer memory won't have url; skip
      } else if (req.files && req.files.verificationDocument && req.files.verificationDocument[0]) {
        // skip, handled in uploadProfileAndDocument
      }
    }

    // nothing more to do because we already set req.uploads in previous steps
    return next();
  } catch (err) {
    console.error("attachUploadedLinks error:", err);
    return next(new ApiError("Error processing uploaded files", 500));
  }
};
