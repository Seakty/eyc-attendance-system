// Checks that the logged-in user (stored in the session) is an admin.

function isAdmin(req) {
  return req.session && req.session.user && req.session.user.role === "admin";
}

// For pages: not an admin -> send them to the login page
function requireAdminPage(req, res, next) {
  if (isAdmin(req)) return next();
  return res.redirect("/login");
}

// For API calls: not an admin -> JSON error (a redirect makes no sense here)
function requireAdminApi(req, res, next) {
  if (isAdmin(req)) return next();
  return res
    .status(401)
    .json({ status: "error", message: "Admin login required." });
}

module.exports = { requireAdminPage, requireAdminApi };
