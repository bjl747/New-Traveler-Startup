// CONFIGURATION
// REPLACE THESE VALUES WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyCPF-lO-FRiJvt9Yd3-HscObz9lKhwarzE",
    authDomain: "new-traveler-startup.firebaseapp.com",
    projectId: "new-traveler-startup",
    storageBucket: "new-traveler-startup.firebasestorage.app",
    messagingSenderId: "706712925299",
    appId: "1:706712925299:web:895b3ed676fd4dffffa606"
};

// REPLACE WITH YOUR DEPLOYED GOOGLE APPS SCRIPT WEB APP URL
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbyz9lpmjlJWqhhZ7tyDmo7z0_1OT7H6HL0XJ1bMOCKA5IFw2Tx6XdEWK0OXD1W8SNRCnQ/exec";

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error("Firebase Init Error (Expected if config is placeholder):", e);
}

const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const userInfo = document.getElementById('user-info');
const userNameSpan = document.getElementById('user-name');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');

// State
let currentUser = null;
let userDocRef = null;

// Auth Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        userDocRef = db.collection('travelers').doc(user.uid);

        // Update UI
        userNameSpan.textContent = user.displayName;
        userInfo.classList.remove('hidden');
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');

        // Load Progress
        await loadUserProgress();
    } else {
        currentUser = null;
        userInfo.classList.add('hidden');
        loginSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
    }
});

// Login
googleLoginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        console.error("Login failed:", error);
        alert("Login failed: " + error.message);
    });
});

// Logout
logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// --- PROGRESS LOGIC ---

async function loadUserProgress() {
    try {
        const doc = await userDocRef.get();
        if (doc.exists) {
            const data = doc.data();
            updateStepUI(1, data.step1_completed);
            updateStepUI(2, data.step2_completed);
            updateStepUI(3, data.step3_completed);

            // Check specific boxes if needed
            if (data.step3_completed) {
                document.getElementById('hsh-confirm').checked = true;
            }
        } else {
            // New User - Create Doc
            await userDocRef.set({
                name: currentUser.displayName,
                email: currentUser.email,
                step1_completed: false,
                step2_completed: false,
                step3_completed: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        updateProgressBar();
    } catch (error) {
        console.error("Error loading progress:", error);
    }
}

function updateStepUI(stepNum, isComplete) {
    const stepCard = document.getElementById(`step-${stepNum}`);
    if (isComplete) {
        stepCard.classList.add('completed');
    } else {
        stepCard.classList.remove('completed');
    }
}

function updateProgressBar() {
    const completed = document.querySelectorAll('.step-card.completed').length;
    const total = 3;
    const percent = (completed / total) * 100;

    document.getElementById('completed-count').textContent = completed;
    document.getElementById('progress-fill').style.width = `${percent}%`;
}

async function markStepComplete(stepNum) {
    updateStepUI(stepNum, true);
    updateProgressBar();

    const updateData = {};
    updateData[`step${stepNum}_completed`] = true;

    await userDocRef.update(updateData);
}

// --- STEP 1: UPLOAD LOGIC ---

const uploadBtn = document.getElementById('upload-btn');

uploadBtn.addEventListener('click', async () => {
    const resumeFile = document.getElementById('resume-upload').files[0];
    const blsFile = document.getElementById('bls-upload').files[0];
    const idFiles = document.getElementById('id-upload').files;
    const certFiles = document.getElementById('certs-upload').files;
    const feedback = document.getElementById('upload-feedback');

    if (!resumeFile || !blsFile || idFiles.length === 0) {
        feedback.textContent = "Please upload Resume, BLS, and Forms of ID.";
        feedback.className = "feedback-msg error";
        return;
    }

    feedback.textContent = "Uploading files... please wait.";
    feedback.className = "feedback-msg";
    uploadBtn.disabled = true;

    try {
        // Sequential Uploads to ensure folder creation consistency
        // (Parallel uploads caused duplicate folders)

        await uploadFileToGAS(resumeFile);
        await uploadFileToGAS(blsFile);

        for (let i = 0; i < idFiles.length; i++) {
            await uploadFileToGAS(idFiles[i]);
        }

        for (let i = 0; i < certFiles.length; i++) {
            await uploadFileToGAS(certFiles[i]);
        }

        feedback.textContent = "All files uploaded successfully!";
        feedback.className = "feedback-msg success";
        await markStepComplete(1);
    } catch (error) {
        console.error(error);
        feedback.textContent = "Upload failed. Please try again.";
        feedback.className = "feedback-msg error";
        uploadBtn.disabled = false;
    }
});

function uploadFileToGAS(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            // Remove "data:application/pdf;base64," prefix
            const base64Data = reader.result.split(',')[1];

            const payload = {
                action: "UPLOAD_FILE",
                fileName: file.name,
                mimeType: file.type,
                fileData: base64Data,
                userName: currentUser.displayName
            };

            // Using fetch with no-cors might be an issue for reading response, 
            // but GAS needs properly set headers. 
            // We use standard fetch expecting JSON.
            fetch(GAS_ENDPOINT, {
                method: "POST",
                body: JSON.stringify(payload)
            })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') resolve(data);
                    else reject(data.message);
                })
                .catch(err => reject(err));
        };
        reader.onerror = error => reject(error);
    });
}


// --- STEP 2: REFERENCES LOGIC ---

const refForm = document.getElementById('reference-form');

refForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const feedback = document.getElementById('ref-feedback');
    const submitBtn = document.getElementById('ref-submit-btn');

    // Gather Data
    const references = [
        {
            fullName: document.getElementById('ref1-name').value,
            title: document.getElementById('ref1-title').value,
            facility: document.getElementById('ref1-facility').value,
            phone: document.getElementById('ref1-phone').value,
            email: document.getElementById('ref1-email').value
        },
        {
            fullName: document.getElementById('ref2-name').value,
            title: document.getElementById('ref2-title').value,
            facility: document.getElementById('ref2-facility').value,
            phone: document.getElementById('ref2-phone').value,
            email: document.getElementById('ref2-email').value
        }
    ];

    feedback.textContent = "Submitting references...";
    feedback.className = "feedback-msg";
    submitBtn.disabled = true;

    try {
        const payload = {
            action: "SUBMIT_REFERENCES",
            userName: currentUser.displayName,
            references: references
        };

        const response = await fetch(GAS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.status === 'success') {
            feedback.textContent = "References submitted successfully!";
            feedback.className = "feedback-msg success";
            await markStepComplete(2);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error(error);
        feedback.textContent = "Submission failed. Please try again.";
        feedback.className = "feedback-msg error";
        submitBtn.disabled = false;
    }
});


// --- STEP 3: HSH TESTING LOGIC ---

const hshCheckbox = document.getElementById('hsh-confirm');

hshCheckbox.addEventListener('change', async (e) => {
    if (e.target.checked) {
        await markStepComplete(3);
    } else {
        // Optional: Allow unchecking? Usually once done it's done, but for UX let's allow toggle off
        // But logic requires DB update
        updateStepUI(3, false);
        updateProgressBar();
        await userDocRef.update({ step3_completed: false });
    }
});
