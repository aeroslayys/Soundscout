/* ============================================================
   SOUNDSCOUT — LOGIN / SIGNUP (OTP-only, no passwords)
   ------------------------------------------------------------
   Talks to the real backend in /soundscout-backend.
   Change API_BASE below once you deploy the backend somewhere
   other than localhost.
   ============================================================ */

const API_BASE = 'http://localhost:4000/api/auth';
const RESEND_COOLDOWN_SECONDS = 30;

let currentEmail = null;
let isNewUser = null;
let selectedSensitivity = null;
let resendCooldownTimer = null;

const stepEmail = document.getElementById('stepEmail');
const stepVerify = document.getElementById('stepVerify');

const emailInput = document.getElementById('emailInput');
const continueBtn = document.getElementById('continueBtn');
const emailStatus = document.getElementById('emailStatus');

const verifyTitle = document.getElementById('verifyTitle');
const verifySub = document.getElementById('verifySub');
const verifyEmailLabel = document.getElementById('verifyEmailLabel');
const otpInput = document.getElementById('otpInput');
const verifyBtn = document.getElementById('verifyBtn');
const verifyStatus = document.getElementById('verifyStatus');
const resendBtn = document.getElementById('resendBtn');
const resendTimer = document.getElementById('resendTimer');
const backBtn = document.getElementById('backBtn');

const newUserFields = document.getElementById('newUserFields');
const nameInput = document.getElementById('nameInput');
const ageInput = document.getElementById('ageInput');
const sensitivityScale = document.getElementById('sensitivityScale');

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setStatus(el, msg, kind){
  el.textContent = msg;
  el.className = 'auth-status ' + (kind || '');
}

function startResendCooldown(){
  let remaining = RESEND_COOLDOWN_SECONDS;
  resendBtn.disabled = true;
  resendTimer.textContent = `Resend in ${remaining}s`;

  clearInterval(resendCooldownTimer);
  resendCooldownTimer = setInterval(() => {
    remaining -= 1;
    if(remaining <= 0){
      clearInterval(resendCooldownTimer);
      resendBtn.disabled = false;
      resendTimer.textContent = '';
    } else {
      resendTimer.textContent = `Resend in ${remaining}s`;
    }
  }, 1000);
}

// ---------- Step 1: request OTP ----------
async function requestOtp(email){
  const res = await fetch(`${API_BASE}/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || 'Could not send code.');
  return data; // { isNewUser, expiresInMinutes }
}

continueBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if(!isValidEmail(email)){
    setStatus(emailStatus, 'Enter a valid email address.', 'error');
    return;
  }

  continueBtn.disabled = true;
  setStatus(emailStatus, 'Sending code...', '');

  try{
    const { isNewUser: newUser } = await requestOtp(email);
    currentEmail = email;
    isNewUser = newUser;

    verifyEmailLabel.textContent = email;
    newUserFields.style.display = isNewUser ? 'block' : 'none';
    verifyTitle.textContent = isNewUser ? 'Verify your email' : 'Enter your code';
    verifySub.innerHTML = isNewUser
      ? `We sent a 6-digit code to <span>${email}</span>. Finish setting up your account below.`
      : `We sent a 6-digit code to <span>${email}</span>.`;
    verifyBtn.textContent = isNewUser ? 'Verify & create account' : 'Verify & log in';

    stepEmail.style.display = 'none';
    stepVerify.style.display = 'block';
    otpInput.value = '';
    otpInput.focus();
    updateVerifyBtnState();
    startResendCooldown();
    setStatus(emailStatus, '', '');
  } catch(err){
    setStatus(emailStatus, err.message, 'error');
  } finally {
    continueBtn.disabled = false;
  }
});

// ---------- Resend ----------
resendBtn.addEventListener('click', async () => {
  if(resendBtn.disabled || !currentEmail) return;
  setStatus(verifyStatus, 'Resending code...', '');
  try{
    await requestOtp(currentEmail);
    setStatus(verifyStatus, 'New code sent.', 'success');
    startResendCooldown();
  } catch(err){
    setStatus(verifyStatus, err.message, 'error');
  }
});

// ---------- Sensitivity scale ----------
sensitivityScale.querySelectorAll('.sens-opt').forEach(el => {
  el.addEventListener('click', () => {
    sensitivityScale.querySelectorAll('.sens-opt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    selectedSensitivity = parseInt(el.dataset.val, 10);
    updateVerifyBtnState();
  });
});

// ---------- Enable verify button once required fields are filled ----------
function updateVerifyBtnState(){
  const otpFilled = otpInput.value.trim().length === 6;

  if(!isNewUser){
    verifyBtn.disabled = !otpFilled;
    return;
  }

  const nameFilled = nameInput.value.trim().length > 0;
  const ageFilled = ageInput.value && Number(ageInput.value) > 0 && Number(ageInput.value) < 120;
  const sensitivityFilled = selectedSensitivity !== null;

  verifyBtn.disabled = !(otpFilled && nameFilled && ageFilled && sensitivityFilled);
}

otpInput.addEventListener('input', () => {
  otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
  updateVerifyBtnState();
});
nameInput.addEventListener('input', updateVerifyBtnState);
ageInput.addEventListener('input', updateVerifyBtnState);

// ---------- Step 2: verify OTP ----------
verifyBtn.addEventListener('click', async () => {
  verifyBtn.disabled = true;
  setStatus(verifyStatus, 'Verifying...', '');

  const payload = {
    email: currentEmail,
    code: otpInput.value.trim(),
  };
  if(isNewUser){
    payload.name = nameInput.value.trim();
    payload.age = Number(ageInput.value);
    payload.sensitivity = selectedSensitivity;
  }

  try{
    const res = await fetch(`${API_BASE}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Verification failed.');

    // Store the session token, then hand off to the main app.
    // API: this token should be attached as
    // Authorization: Bearer <token> on subsequent requests to your backend.
    localStorage.setItem('soundscout_token', data.token);
    localStorage.setItem('soundscout_user', JSON.stringify(data.user));

    setStatus(verifyStatus, 'Success! Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = 'home.html'; // swap for your actual home page route
    }, 600);
  } catch(err){
    setStatus(verifyStatus, err.message, 'error');
    verifyBtn.disabled = false;
  }
});

// ---------- Back to email step ----------
backBtn.addEventListener('click', () => {
  clearInterval(resendCooldownTimer);
  stepVerify.style.display = 'none';
  stepEmail.style.display = 'block';
  currentEmail = null;
  isNewUser = null;
  selectedSensitivity = null;
  sensitivityScale.querySelectorAll('.sens-opt').forEach(o => o.classList.remove('active'));
  nameInput.value = '';
  ageInput.value = '';
  setStatus(verifyStatus, '', '');
});