const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, api, login, newCustomer, RUN } = require("./helpers");
const UserModel = require("../modules/user/user.model");

before(start);
after(stop);

test("register validates input and refuses duplicate emails", async () => {
  assert.equal((await api("POST", "/register", { body: { email: "a@b.co", password: "123456" } })).status, 400);
  assert.equal((await api("POST", "/register", { body: { fullName: "X", email: "not-an-email", password: "123456" } })).status, 400);
  assert.equal((await api("POST", "/register", { body: { fullName: "X", email: `short.${RUN}@example.com`, password: "123" } })).status, 400);
  const dup = await api("POST", "/register", { body: { fullName: "Rahim", email: "RAHIM@example.com", password: "123456" } });
  assert.equal(dup.status, 400);
});

test("register always creates a customer, even when a role is sent", async () => {
  const email = `test.role.${RUN}@example.com`;
  const res = await api("POST", "/register", { body: { fullName: "Sneaky", email, password: "Test@1234", role: "admin" } });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.role, "user");
  assert.equal(res.body.data.password, undefined);
  const saved = await UserModel.findOne({ email });
  assert.equal(saved.role, "user");
  assert.notEqual(saved.password, "Test@1234", "password is stored hashed");
});

test("register stores an optional mobile number", async () => {
  const email = `test.phone.${RUN}@example.com`;
  assert.equal((await api("POST", "/register", { body: { fullName: "P", email, password: "Test@1234", phone: "12345" } })).status, 400);
  const res = await api("POST", "/register", { body: { fullName: "P", email, password: "Test@1234", phone: "+880 1711-000000" } });
  assert.equal(res.status, 201);
  assert.equal((await UserModel.findOne({ email })).phone, "+8801711000000");
});

test("login, refresh and profile", async () => {
  assert.equal((await api("POST", "/login", { body: { email: "rahim@example.com", password: "wrong" } })).status, 401);
  assert.equal((await api("POST", "/login", { body: { email: "nobody@example.com", password: "whatever" } })).status, 401);

  const session = await login("rahim@example.com", "User@123");
  assert.ok(session.token && session.refreshToken);
  assert.equal(session.user.role, "user");

  const refreshed = await api("POST", "/refresh", { body: { refreshToken: session.refreshToken } });
  assert.equal(refreshed.status, 200);
  const profile = await api("GET", "/profile", { token: refreshed.body.data.token });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.email, "rahim@example.com");
  assert.equal(profile.body.data.password, undefined);
  assert.equal(profile.body.data.resetCode, undefined);

  assert.equal((await api("POST", "/refresh", { body: { refreshToken: "garbage" } })).status, 401);
});

test("profile update changes only name and photo", async () => {
  const c = await newCustomer("profile");
  const res = await api("PUT", "/profile", {
    token: c.token,
    body: { fullName: "  Renamed Customer ", profileImage: "https://example.com/me.png", role: "admin", email: "hijack@example.com" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.fullName, "Renamed Customer");
  assert.equal(res.body.data.profileImage.url, "https://example.com/me.png");
  const saved = await UserModel.findById(c.user._id);
  assert.equal(saved.role, "user");
  assert.equal(saved.email, c.email);
});

test("change password needs the current password", async () => {
  const c = await newCustomer("chpw");
  assert.equal((await api("PUT", "/change-password", { token: c.token, body: { currentPassword: "wrong", newPassword: "New@12345" } })).status, 400);
  assert.equal((await api("PUT", "/change-password", { token: c.token, body: { currentPassword: c.password, newPassword: "123" } })).status, 400);
  const ok = await api("PUT", "/change-password", { token: c.token, body: { currentPassword: c.password, newPassword: "New@12345" } });
  assert.equal(ok.status, 200);
  await login(c.email, "New@12345");
  assert.equal((await api("POST", "/login", { body: { email: c.email, password: c.password } })).status, 401);
});

test("forgot + reset password", async () => {
  const c = await newCustomer("reset");

  // same answer for unknown emails, so accounts can't be discovered
  const unknown = await api("POST", "/forgot-password", { body: { email: `nobody.${RUN}@example.com` } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.data.devCode, undefined);
  assert.equal((await api("POST", "/forgot-password", { body: { email: "bad" } })).status, 400);

  const sent = await api("POST", "/forgot-password", { body: { email: c.email.toUpperCase() } });
  assert.equal(sent.status, 200);
  const stored = await UserModel.findById(c.user._id).select("+resetCode +resetCodeExpires");
  assert.ok(stored.resetCode && stored.resetCodeExpires > new Date());

  const code = sent.body.data.devCode;
  if (!code) {
    // SMTP is configured, so the code went by email and can't be read here
    assert.equal(sent.body.data.emailSent, true);
    return;
  }
  assert.match(code, /^\d{6}$/);
  assert.notEqual(stored.resetCode, code, "the code is stored hashed");

  const wrong = code === "000000" ? "111111" : "000000";
  assert.equal((await api("POST", "/reset-password", { body: { email: c.email, code: wrong, newPassword: "Reset@123" } })).status, 400);
  assert.equal((await api("POST", "/reset-password", { body: { email: c.email, code, newPassword: "12" } })).status, 400);

  const reset = await api("POST", "/reset-password", { body: { email: c.email, code, newPassword: "Reset@123" } });
  assert.equal(reset.status, 200);
  assert.ok(reset.body.data.token, "reset signs the user in");

  // old sessions are signed out and the code can't be reused
  assert.equal((await api("POST", "/refresh", { body: { refreshToken: c.refreshToken } })).status, 401);
  assert.equal((await api("POST", "/reset-password", { body: { email: c.email, code, newPassword: "Again@123" } })).status, 400);
  await login(c.email, "Reset@123");
});

test("reset codes lock after 5 wrong tries", async () => {
  const c = await newCustomer("lock");
  const sent = await api("POST", "/forgot-password", { body: { email: c.email } });
  const code = sent.body.data.devCode;
  if (!code) return;
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    await api("POST", "/reset-password", { body: { email: c.email, code: wrong, newPassword: "Reset@123" } });
  }
  const locked = await api("POST", "/reset-password", { body: { email: c.email, code, newPassword: "Reset@123" } });
  assert.equal(locked.status, 400);
  assert.match(locked.body.message, /Too many/);
});

test("Google sign-in", async () => {
  const res = await api("POST", "/auth/google", { body: { idToken: "not-a-real-token" } });
  if (!process.env.GOOGLE_CLIENT_ID) {
    assert.equal(res.status, 503, "reports that Google sign-in isn't configured");
  } else {
    assert.equal(res.status, 401, "rejects a token Google doesn't recognise");
  }
});

test("deactivated accounts can't sign in or refresh", async () => {
  const c = await newCustomer("inactive");
  const off = await api("PUT", `/users/${c.user._id}`, { as: "admin", body: { isActive: false } });
  assert.equal(off.status, 200);
  assert.equal((await api("POST", "/login", { body: { email: c.email, password: c.password } })).status, 403);
  assert.equal((await api("POST", "/refresh", { body: { refreshToken: c.refreshToken } })).status, 401);
});

test("logout revokes the refresh token", async () => {
  const c = await newCustomer("logout");
  assert.equal((await api("POST", "/logout", { body: { refreshToken: c.refreshToken } })).status, 200);
  assert.equal((await api("POST", "/refresh", { body: { refreshToken: c.refreshToken } })).status, 401);
});
