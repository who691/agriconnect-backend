// backend/middleware/adminAuth.js
module.exports = function (req, res, next) {
  // authMiddleware must run BEFORE this to populate req.user
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Access denied: Admins only' });
  }
  next();
};