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

// Ensure persistence is set to LOCAL
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => {
        console.error("Persistence Error:", error);
    });

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
    console.log("Auth State Changed: " + (user ? user.email : "No User"));

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
    auth.signInWithPopup(provider)
        .catch((error) => {
            console.error("Login Failed:", error);
            alert("Login Failed: " + error.message);
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
            // Check for full completion
            checkCompletion(data);
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

    // Verify if all steps are done to show popup
    const freshDoc = await userDocRef.get();
    if (freshDoc.exists) {
        checkCompletion(freshDoc.data());
    }
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

        // Notify Admin with Folder Link
        await sendUploadNotification(currentUser.displayName);

    } catch (error) {
        console.error(error);
        feedback.textContent = "Upload failed: " + (error.message || error);
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
                .catch(err => reject("Network/GAS Error: " + err.toString()));
        };
        reader.onerror = error => reject(error);
    });
}

function sendUploadNotification(name) {
    // Best effort - triggers email with folder link
    fetch(GAS_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
            action: "NOTIFY_UPLOAD_STEP_COMPLETE",
            userName: name
        })
    }).catch(e => console.error("Failed to send upload notification", e));
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
        await userDocRef.update({ step3_completed: false });
    }
});

// --- POPUP LOGIC ---
const completionModal = document.getElementById('completion-modal');
const closeModalSpan = document.querySelector('.close-modal');
const modalOkBtn = document.getElementById('modal-ok-btn');

// Flag to prevent double notification if page is reloaded? 
// Current logic checks every time, but email spam might be an issue.
// For now, simpler is better, but maybe check if we already sent? 
// Better: Database should have a 'notified' flag. 
// For this iteration, let's just send it. Or verify if the 'completed' modal is shown for the first time.

async function checkCompletion(data) {
    if (data.step1_completed && data.step2_completed && data.step3_completed) {
        if (completionModal) completionModal.classList.remove('hidden');

        // Start 5-minute timer to auto-logout/reset for next user
        setTimeout(() => {
            auth.signOut().then(() => location.reload());
        }, 300000); // 300,000 ms = 5 minutes

        // Send Email Notification (Only if not already sent check? 
        // We will just send it for now, user can manage duplicates)
        // Ideally we'd add a 'notified: true' field to DB.
        if (!data.completion_notified) {
            await sendCompletionNotification(currentUser.displayName);
        }
    }
}

async function sendCompletionNotification(name) {
    try {
        await fetch(GAS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify({
                action: "NOTIFY_COMPLETION",
                userName: name
            })
        });
        // Mark as notified so we don't spam on refresh
        await userDocRef.update({ completion_notified: true });
    } catch (e) {
        console.error("Failed to send notification:", e);
    }
}

if (closeModalSpan) {
    closeModalSpan.addEventListener('click', () => {
        completionModal.classList.add('hidden');
    });
}

if (modalOkBtn) {
    modalOkBtn.addEventListener('click', () => {
        completionModal.classList.add('hidden');
    });
}

const modalResetBtn = document.getElementById('modal-reset-btn');
if (modalResetBtn) {
    modalResetBtn.addEventListener('click', () => {
        auth.signOut().then(() => location.reload());
    });
}

window.addEventListener('click', (e) => {
    if (e.target == completionModal) {
        completionModal.classList.add('hidden');
    }
});
