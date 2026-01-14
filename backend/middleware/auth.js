// Authentication middleware

// Require user to be logged in
export function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Require user to be an admin
export function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.is_admin) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
}

// Optional authentication - doesn't fail if not logged in
export function optionalAuth(req, res, next) {
  // Just continue - passport already attached user if authenticated
  next();
}
