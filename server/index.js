const cors = require("cors");
const express = require('express');
const cors = require("cors");
const mongoose = require('mongoose');
require('dotenv').config();
const session = require('express-session');
const { MongoStore } = require("connect-mongo");
const authRoutes = require('./authRoutes');

const app = express();
   app.use(cors({
     origin: "https://interview-prep-kit-three.vercel.app",
     credentials: true
   }));


// Needed so `secure` cookies work behind Render/Railway/Vercel's proxy
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000", // exact deployed frontend URL, not "*"
  credentials: true ,                   // allow cookies cross-origin
}));
app.use(express.json());

// Session middleware — must come before routes using req.session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
  })
);

app.use('/api/auth', authRoutes);
const kitRoutes = require('./routes/kitRoutes');
app.use('/api/kits', kitRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully!'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});