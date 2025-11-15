const mongoose = require("mongoose");

// ========================
// Seller Card Schema 
// ========================

const sellerCardSchema = new mongoose.Schema({
  idType: {
    type: String,                     //  "national_id" | "passport" | "commercial_register"
    required: true
  },
  idNumber: {
    type: String,                     // رقم البطاقة/السجل
    required: true
  },
  documentUrl: {
    type: String,                     
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["unverified","submitted","verified","rejected"],
    default: "submitted",
    index: true
  },
  verifiedBy: {                        
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  verifiedAt: Date,
  rejectionReason: String
}, 
{ _id: false }
);

// ========================
// Seller Profile Schema
// ========================
const shippingOptionSchema = new mongoose.Schema(
  {
    method: { type: String, required: true },  //  "home-delivery" | "pickup"
    cost: { type: Number, default: 0 },
    estimatedDays: { type: Number, default: 3 },
  },
  { _id: false }
);

const sellerProfileSchema = new mongoose.Schema(
  {
    shopName: {
      type: String,
      required: true,
      trim: true,
    },
    shopDescription: String,
    rating: {
      type: Number,
      default: 0,
    },
    totalSales: {
      type: Number,
      default: 0,
    },
    logo: String,
    coverImage: String,
    categories: [String],

    address: {
      type: String,
      required: false,
    },

    workingHours: {
      open: { type: String, default: "09:00" },
      close: { type: String, default: "21:00" },
    },

    shippingOptions: [shippingOptionSchema],
    verificationCard: sellerCardSchema, 
  },
  { _id: false }
);


// ========================
// Buyer Profile Schema
// ========================
const addressSchema = new mongoose.Schema(
  {
    country: { type: String, default: "Egypt" },
    city: String,
    street: String,
    building: String,
    floor: String,
    apartment: String,
    postalCode: String,
  },
  {_id:false}
);

const buyerProfileSchema = new mongoose.Schema(
  {
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],

    purchaseHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],

    preferredPaymentMethod: {
      type: String,
      default: null,
    },

    preferredCategories: [String],

    phoneNumber: String,

    address: addressSchema,
  },
  { _id: false }
);


// ========================
// User Schema
// ========================
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      required: true,
    },
    lastName: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
    },

    passwordChangedAt: Date,
    passwordResetCode: String,
    passwordResetExpires: Date,
    passwordResetVerified: Boolean,

    role: {
      type: String,
      enum: ["buyer", "seller", "admin"],
      default: "buyer",
    },

    fcmToken: String,

    preferredLang: {
      type: String,
      enum: ["en", "ar"],
      default: "en",
    },

    sellerProfile: {
      type: sellerProfileSchema,
      required: function () {
        return this.role === "seller";
      },
    },

    buyerProfile: {
      type: buyerProfileSchema,
      required: function () {
        return this.role === "buyer";
      },
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
