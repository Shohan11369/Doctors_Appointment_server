const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5000",
  "https://doctots-appointment-front.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error("DEBUG: Rejected Origin:", origin);
        console.error("DEBUG: Allowed Origins:", JSON.stringify(allowedOrigins));
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Database Connection
const uri = process.env.MONGODB_URI;
const maskedUri = uri.replace(/:[^:@]+@/, ":****@");
console.log(`Connecting to MongoDB with URI: ${maskedUri}`);

mongoose
  .connect(uri, { dbName: "DoctorsAppoint" })
  .then(async () => {
    console.log("Connected to MongoDB");
    console.log(
      "Actual Connected Database:",
      mongoose.connection.db?.databaseName,
    );
  })
  .catch((err) => console.error("Could not connect to MongoDB", err));

// --- Models ---
const User = mongoose.models.User || mongoose.model(
  "User",
  new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["patient", "doctor", "admin"],
      default: "patient",
    },
    sex: String,
    years: Number,
  }),
);

const Doctor = mongoose.models.Doctor || mongoose.model(
  "Doctor",
  new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    name: String,
    specialization: String,
    bio: String,
    image: String,
    experience: Number,
    fee: Number,
    rating: Number,
  }),
  "doctors",
);

const Appointment = mongoose.models.Appointment || mongoose.model(
  "Appointment",
  new mongoose.Schema({
    patientId: mongoose.Schema.Types.ObjectId,
    doctorId: mongoose.Schema.Types.ObjectId,
    date: Date,
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
  }),
);

const Review = mongoose.models.Review || mongoose.model(
  "Review",
  new mongoose.Schema(
    {
      doctorId: mongoose.Schema.Types.ObjectId,
      patientId: mongoose.Schema.Types.ObjectId,
      rating: Number,
      comment: String,
    },
    { timestamps: true },
  ),
);

const DoctorPost = mongoose.models.DoctorPost || mongoose.model(
  "DoctorPost",
  new mongoose.Schema(
    {
      doctorId: mongoose.Schema.Types.ObjectId,
      name: { type: String, required: true },
      title: { type: String, required: true },
      content: { type: String, required: true },
      description: { type: String, required: true },
      fees: { type: Number, required: true },
      imageUrl: String,
    },
    { timestamps: true },
  ),
  "doctorposts",
);

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const fileName = `${Date.now()}-${file.fieldname}${ext}`;
    cb(null, fileName);
  },
});

const upload = multer({ storage });

app.use("/uploads", express.static(uploadDir));

const getDoctorProfileByUserId = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return null;

  let doctor = await Doctor.findOne({ userId });
  if (!doctor) {
    doctor = new Doctor({
      userId,
      name: user.name,
      specialization: "General Practitioner",
      bio: "Experienced healthcare professional.",
      experience: 0,
      fee: 0,
      rating: 0,
    });
    await doctor.save();
  }

  return doctor;
};

// --- Middleware ---
let auth;

const authenticate = (req, res, next) => {
  let token = req.cookies && req.cookies.token;
  if (!token && req.headers && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) token = parts[1];
  }
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Forbidden" });
    req.user = user;
    next();
  });
};

const authorize =
  (roles = []) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ message: "Access denied" });
    next();
  };

// Dynamically load Better Auth
async function initAuth() {
  const { betterAuth } = await import("better-auth");
  const { mongodbAdapter } = await import("better-auth/adapters/mongodb");
  const { MongoClient } = require("mongodb");
  const mongoClient = new MongoClient(process.env.MONGODB_URI);

  auth = betterAuth({
    database: mongodbAdapter(mongoClient.db("DoctorsAppoint")),
    secret: process.env.BETTER_AUTH_SECRET || "a_secure_random_string_for_session_encryption_fallback",
    trustedOrigins: ["http://localhost:3000", "http://localhost:5000", "https://doctots-appointment-front.vercel.app"],
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID",
        clientSecret:
          process.env.GOOGLE_CLIENT_SECRET || "YOUR_GOOGLE_CLIENT_SECRET",
      },
    },
  });

  console.log("Better Auth initialized successfully");

  const { toNodeHandler } = await import("better-auth/node");
  app.all(["/api/auth", "/api/auth/*path"], (req, res, next) => {
    try {
      return toNodeHandler(auth)(req, res, next);
    } catch (err) {
      console.error("Error in auth handler:", err);
      res.status(500).json({ error: "Internal Auth Error", details: err.message });
    }
  });
  }

  initAuth().catch(err => console.error("Error initializing auth:", err));

// --- Routes ---
// Custom Bridge for GET /api/auth/google
app.get("/api/auth/google", (req, res) => {
  const finalCallbackURL = req.query.callbackURL || "http://localhost:3000";
  const role = req.query.role || "patient";

  res.cookie("pending_role", role, { path: "/", maxAge: 1000 * 60 * 15 });
  res.cookie("final_redirect", finalCallbackURL, { path: "/", maxAge: 1000 * 60 * 15 });

  const successUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/google/success`;

  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Redirecting to Google...</title></head>
      <body>
        <p>Redirecting to Google securely...</p>
        <script>
          fetch('/api/auth/sign-in/social', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              provider: 'google', 
              callbackURL: '${successUrl}' 
            })
          })
          .then(r => r.json())
          .then(data => {
            if (data.url) window.location.href = data.url;
            else document.body.innerHTML = 'Error initiating Google login. ' + JSON.stringify(data);
          })
          .catch(err => document.body.innerHTML = 'Network error: ' + err.message);
        </script>
      </body>
    </html>
  `);
});

// OAuth Success Handler
app.get("/api/auth/google/success", async (req, res) => {
  try {
    if (!auth) return res.status(503).send("Auth not initialized");
    const sessionResponse = await auth.api.getSession({ headers: req.headers });
    if (!sessionResponse || !sessionResponse.user) {
      return res.status(401).json({ error: "OAuth login failed or session not found" });
    }

    const { user } = sessionResponse;
    const finalRedirect = req.cookies.final_redirect || "http://localhost:3000";
    const pendingRole = req.cookies.pending_role || "patient";

    let dbUser = await User.findOne({ email: user.email });
    
    if (dbUser) {
      if (!dbUser.password && dbUser.role !== pendingRole) {
        dbUser.role = pendingRole;
        await dbUser.save();
      }
    } else {
      const hashedPassword = await bcrypt.hash(Math.random().toString(36).slice(-8), 10);
      dbUser = new User({
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: pendingRole,
      });
      await dbUser.save();
    }

    if (dbUser.role === "doctor") {
      const existingDoc = await Doctor.findOne({ userId: dbUser._id });
      if (!existingDoc) {
        const doctor = new Doctor({
          userId: dbUser._id,
          name: dbUser.name,
          specialization: "General Practitioner",
          bio: "Experienced healthcare professional.",
          experience: 0,
          fee: 0,
          rating: 0,
        });
        await doctor.save();
      }
    }

    const token = jwt.sign({ id: dbUser._id, role: dbUser.role }, JWT_SECRET, { expiresIn: "1h" });
    
    res.cookie("token", token, { httpOnly: false, sameSite: "lax" });
    res.clearCookie("pending_role");
    res.clearCookie("final_redirect");

    res.redirect(finalRedirect);
  } catch (err) {
    console.error("Success Handler Error:", err);
    res.status(500).send("Error finalizing login: " + err.message);
  }
});

app.get("/", (req, res) => {
  res.send("Welcome to MediQueue Pro Backend!");
});

app.get("/api/debug-doctors", async (req, res) => {
  try {
    const allDoctors = await Doctor.find({});
    res.json(allDoctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role, sex, years } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, Email and password are required" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      sex,
      years,
    });
    await user.save();

    if (role === "doctor") {
      const doctor = new Doctor({
        userId: user._id,
        name,
        specialization: "General Practitioner",
        bio: "Experienced healthcare professional.",
        experience: 0,
        fee: 0,
        rating: 0,
      });
      await doctor.save();
    }

    res.status(201).json({ message: "User registered" });
  } catch (error) {
    console.error("Error registering user:", error);
    res
      .status(500)
      .json({ message: "Error registering user", error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res
      .cookie("token", token, { httpOnly: false, sameSite: "lax" })
      .json({ message: "Logged in", token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get(
  "/api/admin/overview",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const totalAppointments = await Appointment.countDocuments({});
      const totalUsers = await User.countDocuments({});
      const totalDoctors = await Doctor.countDocuments({});

      const confirmedAppointments = await Appointment.find({
        status: "confirmed",
      });
      let totalMoney = 0;

      for (const app of confirmedAppointments) {
        const doctor = await Doctor.findById(app.doctorId);
        if (doctor && doctor.fee) {
          totalMoney += doctor.fee;
        }
      }

      res.json({
        totalAppointments,
        totalUsers,
        totalDoctors,
        totalMoney,
      });
    } catch (error) {
      console.error("Error fetching admin overview:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.patch(
  "/api/admin/appointments/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { status } = req.body;
      if (!["pending", "confirmed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const appointment = await Appointment.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true },
      );

      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment status:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.delete(
  "/api/admin/appointments/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const appointment = await Appointment.findByIdAndDelete(req.params.id);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.json({ message: "Appointment deleted" });
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get(
  "/api/admin/appointments",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const appointments = await Appointment.find({});

      const hydratedAppointments = [];
      for (const app of appointments) {
        const patient = await User.findById(app.patientId).select("name email");
        const doctor = await Doctor.findById(app.doctorId);

        hydratedAppointments.push({
          _id: app._id,
          patientName: patient ? patient.name : "Unknown",
          doctorName: doctor ? doctor.name : "Unknown",
          doctorFee: doctor ? doctor.fee : 0,
          date: app.date,
          status: app.status,
        });
      }

      res.json(hydratedAppointments);
    } catch (error) {
      console.error("Error fetching admin appointments:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get(
  "/api/admin/requests",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const requests = await Appointment.find({ status: "pending" });

      const hydrated = [];
      for (const r of requests) {
        const patient = await User.findById(r.patientId).select("name email");
        const doctor = await Doctor.findById(r.doctorId).select(
          "name specialization fee",
        );
        hydrated.push({
          _id: r._id,
          patientName: patient ? patient.name : "Unknown",
          patientEmail: patient ? patient.email : "",
          doctorName: doctor ? doctor.name : "Unknown",
          doctorSpecialization: doctor ? doctor.specialization : "",
          doctorFee: doctor ? doctor.fee : 0,
          date: r.date,
          status: r.status,
        });
      }

      res.json(hydrated);
    } catch (error) {
      console.error("Error fetching appointment requests:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({}).sort({ createdAt: -1 });
    const output = await Promise.all(
      reviews.map(async (rev) => {
        const patient = await User.findById(rev.patientId).select("name");
        const doctor = await Doctor.findById(rev.doctorId).select("name");
        return {
          _id: rev._id,
          patientName: patient ? patient.name : "Anonymous",
          doctorName: doctor ? doctor.name : "Unknown",
          rating: rev.rating,
          comment: rev.comment,
          createdAt: rev.createdAt,
        };
      }),
    );
    res.json(output);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get(
  "/api/admin/reviews",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const reviews = await Review.find({});
      const out = [];
      for (const rev of reviews) {
        const patient = await User.findById(rev.patientId).select("name email");
        const doctor = await Doctor.findById(rev.doctorId).select("name");
        out.push({
          _id: rev._id,
          doctorName: doctor ? doctor.name : "Unknown",
          patientName: patient ? patient.name : "Unknown",
          rating: rev.rating,
          comment: rev.comment,
        });
      }
      res.json(out);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get(
  "/api/admin/profile",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select("-password");

      const totalAppointments = await Appointment.countDocuments({});
      const pendingRequests = await Appointment.countDocuments({
        status: "pending",
      });
      const totalUsers = await User.countDocuments({});
      const totalDoctors = await Doctor.countDocuments({});

      res.json({
        user,
        stats: { totalAppointments, pendingRequests, totalUsers, totalDoctors },
      });
    } catch (error) {
      console.error("Error fetching admin profile:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get("/api/me", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(
  "/api/doctor/profile",
  authenticate,
  authorize(["doctor"]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select("-password");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const doctor = await getDoctorProfileByUserId(req.user.id);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor profile not found" });
      }

      const reviews = await Review.find({ doctorId: doctor._id });
      const averageRating = reviews.length
        ? reviews.reduce((sum, rev) => sum + rev.rating, 0) / reviews.length
        : 0;

      res.json({
        user,
        doctor: {
          ...doctor.toObject(),
          averageRating: Number(averageRating.toFixed(1)),
          reviewCount: reviews.length,
        },
      });
    } catch (error) {
      console.error("Error fetching doctor profile:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get(
  "/api/doctor/overview",
  authenticate,
  authorize(["doctor"]),
  async (req, res) => {
    try {
      const doctor = await getDoctorProfileByUserId(req.user.id);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor profile not found" });
      }

      const appointments = await Appointment.find({ doctorId: doctor._id });
      const reviews = await Review.find({ doctorId: doctor._id });

      const totalPatients = new Set(
        appointments.map((app) => app.patientId.toString()),
      ).size;
      const todayAppointments = appointments.filter((app) => {
        const appDate = new Date(app.date);
        const today = new Date();
        return appDate.toDateString() === today.toDateString();
      }).length;
      const pendingAppointments = appointments.filter(
        (app) => app.status === "pending",
      ).length;
      const confirmedAppointments = appointments.filter(
        (app) => app.status === "confirmed",
      ).length;
      const totalEarnings = confirmedAppointments * (doctor.fee || 0);
      const averageRating = reviews.length
        ? reviews.reduce((sum, rev) => sum + rev.rating, 0) / reviews.length
        : 0;

      res.json({
        totalPatients,
        todayAppointments,
        pendingAppointments,
        confirmedAppointments,
        totalEarnings,
        averageRating: Number(averageRating.toFixed(1)),
      });
    } catch (error) {
      console.error("Error fetching doctor overview:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get(
  "/api/doctor/appointments",
  authenticate,
  authorize(["doctor"]),
  async (req, res) => {
    try {
      const doctor = await getDoctorProfileByUserId(req.user.id);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor profile not found" });
      }

      const appointments = await Appointment.find({
        doctorId: doctor._id,
      }).sort({ date: -1 });
      const output = await Promise.all(
        appointments.map(async (appointment) => {
          const patient = await User.findById(appointment.patientId).select(
            "name email",
          );
          return {
            _id: appointment._id,
            patientName: patient ? patient.name : "Unknown",
            patientEmail: patient ? patient.email : "",
            date: appointment.date,
            status: appointment.status,
          };
        }),
      );

      res.json(output);
    } catch (error) {
      console.error("Error fetching doctor appointments:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get(
  "/api/doctor/patients",
  authenticate,
  authorize(["doctor"]),
  async (req, res) => {
    try {
      const doctor = await getDoctorProfileByUserId(req.user.id);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor profile not found" });
      }

      const appointments = await Appointment.find({
        doctorId: doctor._id,
      }).sort({ date: -1 });
      const patientsMap = new Map();

      for (const appointment of appointments) {
        const patientId = appointment.patientId.toString();
        if (!patientsMap.has(patientId)) {
          const patient = await User.findById(appointment.patientId).select(
            "name email",
          );
          patientsMap.set(patientId, {
            patientName: patient ? patient.name : "Unknown",
            patientEmail: patient ? patient.email : "",
            lastAppointment: appointment.date,
            visits: 0,
          });
        }

        const patientData = patientsMap.get(patientId);
        patientData.visits += 1;
        if (appointment.date > patientData.lastAppointment) {
          patientData.lastAppointment = appointment.date;
        }
      }

      res.json(
        Array.from(patientsMap.values()).map((patientData) => ({
          ...patientData,
          lastAppointment: patientData.lastAppointment,
        })),
      );
    } catch (error) {
      console.error("Error fetching doctor patients:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.post(
  "/api/doctor/posts",
  authenticate,
  authorize(["doctor"]),
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, title, content, description, fees } = req.body;
      if (!name || !title || !content || !description || !fees) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const doctor = await getDoctorProfileByUserId(req.user.id);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor profile not found" });
      }

      const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
      const post = new DoctorPost({
        doctorId: doctor._id,
        name,
        title,
        content,
        description,
        fees,
        imageUrl,
      });
      await post.save();
      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating doctor post:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get(
  "/api/doctor/posts",
  authenticate,
  authorize(["doctor"]),
  async (req, res) => {
    try {
      const doctor = await getDoctorProfileByUserId(req.user.id);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor profile not found" });
      }

      const posts = await DoctorPost.find({ doctorId: doctor._id }).sort({
        createdAt: -1,
      });

      const output = posts.map((post) => ({
        _id: post._id,
        name: post.name,
        title: post.title,
        content: post.content,
        description: post.description,
        fees: post.fees,
        imageUrl: post.imageUrl,
        createdAt: post.createdAt,
        doctorName: doctor.name,
      }));

      res.json(output);
    } catch (error) {
      console.error("Error fetching doctor posts:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get("/api/my-appointments", authenticate, async (req, res) => {
  try {
    const appointments = await Appointment.find({ patientId: req.user.id });
    res.json(appointments);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post(
  "/api/reviews",
  authenticate,
  authorize(["patient"]),
  async (req, res) => {
    try {
      const { doctorId, rating, comment } = req.body;
      if (!doctorId || !rating || !comment) {
        return res
          .status(400)
          .json({ message: "Doctor, rating and comment are required" });
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res
          .status(400)
          .json({ message: "Rating must be an integer between 1 and 5" });
      }

      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }

      const review = new Review({
        doctorId,
        patientId: req.user.id,
        rating,
        comment,
      });
      await review.save();

      res.status(201).json(review);
    } catch (error) {
      console.error("Error submitting review:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.delete(
  "/api/reviews/:id",
  authenticate,
  authorize(["patient"]),
  async (req, res) => {
    try {
      if (!req.params.id || req.params.id === 'undefined' || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid or missing Review ID" });
      }

      const review = await Review.findById(req.params.id);
      
      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }

      if (review.patientId.toString() !== req.user.id) {
        return res.status(403).json({ message: "Forbidden: You can only delete your own reviews" });
      }

      await Review.findByIdAndDelete(req.params.id);
      res.json({ message: "Review deleted successfully" });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.get("/api/doctor/:id/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ doctorId: req.params.id });
    const output = await Promise.all(
      reviews.map(async (rev) => {
        const patient = await User.findById(rev.patientId).select("name");
        return {
          _id: rev._id,
          patientName: patient ? patient.name : "Anonymous",
          rating: rev.rating,
          comment: rev.comment,
          createdAt: rev.createdAt,
        };
      }),
    );
    res.json(output);
  } catch (error) {
    console.error("Error fetching doctor reviews:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/my-reviews", authenticate, async (req, res) => {
  try {
    const reviews = await Review.find({ patientId: req.user.id });
    const output = await Promise.all(
      reviews.map(async (rev) => {
        const doctor = await Doctor.findById(rev.doctorId).select("name");
        return {
          _id: rev._id,
          doctorName: doctor ? doctor.name : "Unknown",
          rating: rev.rating,
          comment: rev.comment,
          createdAt: rev.createdAt,
        };
      }),
    );
    res.json(output);
  } catch (error) {
    console.error("Error fetching patient reviews:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get(
  "/api/doctor/reviews",
  authenticate,
  authorize(["doctor"]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "Doctor user not found" });
      }

      let doctor = await Doctor.findOne({ userId: req.user.id });
      if (!doctor && user.name) {
        doctor = await Doctor.findOne({ name: user.name });
      }
      if (!doctor) {
        return res.status(404).json({ message: "Doctor profile not found" });
      }

      const reviews = await Review.find({ doctorId: doctor._id });
      const output = await Promise.all(
        reviews.map(async (rev) => {
          const patient = await User.findById(rev.patientId).select("name");
          return {
            _id: rev._id,
            patientName: patient ? patient.name : "Anonymous",
            rating: rev.rating,
            comment: rev.comment,
            createdAt: rev.createdAt,
          };
        }),
      );
      res.json(output);
    } catch (error) {
      console.error("Error fetching doctor dashboard reviews:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

app.post("/api/appointments", authenticate, async (req, res) => {
  try {
    const { doctorId, date } = req.body;
    const appointment = new Appointment({
      patientId: req.user.id,
      doctorId,
      date,
      status: "pending",
    });
    await appointment.save();
    res.status(201).json(appointment);
  } catch (error) {
    console.error("Error booking appointment:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/doctor/:id", async (req, res) => {
  console.log("Hit /api/doctor/:id with ID:", req.params.id);
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      console.log("Doctor not found for ID:", req.params.id);
      return res.status(404).json({ message: "Doctor not found" });
    }
    res.json(doctor);
  } catch (error) {
    console.error("Error fetching doctor:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/doctors", async (req, res) => {
  console.log("Hit /api/doctors");
  try {
    const doctors = await Doctor.find({});
    console.log("Found all doctors:", doctors.length);
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post(
  "/api/doctors",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    const doctor = new Doctor(req.body);
    await doctor.save();
    res.status(201).json(doctor);
  },
);

if (process.env.NODE_ENV === 'production') {
  module.exports = app;
} else {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}
