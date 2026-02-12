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

        // Admin Check
        if (user.email === 'ben.layher@gmail.com' || user.email === 'testadmin@example.com') {
            document.getElementById('admin-btn').classList.remove('hidden');
        }

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

async function markStepComplete(stepNum, folderUrl = null) {
    updateStepUI(stepNum, true);
    updateProgressBar();

    const updateData = {};
    updateData[`step${stepNum}_completed`] = true;

    if (folderUrl) {
        updateData.folderUrl = folderUrl;
    }

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

        let lastUploadData = null;
        for (let i = 0; i < certFiles.length; i++) {
            lastUploadData = await uploadFileToGAS(certFiles[i]);
        }

        feedback.textContent = "All files uploaded successfully!";
        feedback.className = "feedback-msg success";
        await markStepComplete(1, lastUploadData ? lastUploadData.folderUrl : null);

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
                    if (data.status === 'success') {
                        // Capture folderUrl if present (should resolve with full object)
                        resolve(data);
                    } else reject(data.message);
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

            // Save References to Firestore for Admin View
            await userDocRef.update({
                references: references
            });

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
const closeModalSpan = completionModal ? completionModal.querySelector('.close-modal') : null;
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

const adminSection = document.getElementById('admin-section');
const adminBtn = document.getElementById('admin-btn');
const backToDashBtn = document.getElementById('back-to-dash-btn');
const refreshAdminBtn = document.getElementById('refresh-admin-btn');

// Admin Logic
async function loadAdminData() {
    const tableBody = document.getElementById('admin-table-body');
    const loadingDiv = document.getElementById('admin-loading');

    tableBody.innerHTML = '';
    loadingDiv.classList.remove('hidden');

    try {
        const snapshot = await db.collection('travelers').orderBy('createdAt', 'desc').get();

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No travelers found.</td></tr>';
            loadingDiv.classList.add('hidden');
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const createdDate = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';

            const checkIcon = '<i class="fas fa-check-circle status-check"></i>';
            const dashIcon = '<i class="far fa-circle status-pending"></i>';

            const status = (data.step1_completed && data.step2_completed && data.step3_completed)
                ? '<span class="status-badge badge-complete">Completed</span>'
                : '<span class="status-badge badge-progress">In Progress</span>';

            // Folder Link Button
            let folderLink = '<span class="text-muted">-</span>';
            if (data.folderUrl) {
                folderLink = `<a href="${data.folderUrl}" target="_blank" class="btn btn-outline" style="padding: 2px 8px; font-size: 0.8rem;"><i class="fas fa-folder-open"></i> View</a>`;
            } else if (data.step1_completed) {
                // Legacy or missing URL
                folderLink = '<span class="text-muted" title="Url not saved">No Link</span>';
            }

            // Reference View Button
            let refBtn = dashIcon;
            if (data.step2_completed) {
                // If references saved in DB, show View button. If not, just show check.
                if (data.references) {
                    refBtn = `<button class="btn btn-outline" onclick="openRefModal('${doc.id}')" style="padding: 2px 8px; font-size: 0.8rem;"><i class="fas fa-eye"></i> View</button>`;
                } else {
                    refBtn = checkIcon; // Legacy support
                }
            }

            html += `
                <tr>
                    <td>${data.name || 'Unknown'}</td>
                    <td>${data.email || 'N/A'}</td>
                    <td>${createdDate}</td>
                    <td class="text-center">${folderLink}</td>
                    <td class="text-center">${refBtn}</td>
                    <td class="text-center">${data.step3_completed ? checkIcon : dashIcon}</td>
                    <td class="text-center">${status}</td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;

    } catch (error) {
        console.error("Admin Load Error:", error);
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:red">Error loading data: ${error.message} (Check Firestore Rules)</td></tr>`;
    } finally {
        loadingDiv.classList.add('hidden');
    }
}

// Admin Event Listeners
if (adminBtn) {
    adminBtn.addEventListener('click', () => {
        dashboardSection.classList.add('hidden');
        adminSection.classList.remove('hidden');
        loadAdminData();
    });
}

if (backToDashBtn) {
    backToDashBtn.addEventListener('click', () => {
        adminSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
    });
}

if (refreshAdminBtn) {
    refreshAdminBtn.addEventListener('click', loadAdminData);
}

// Export CSV (Simple implementation)
const exportBtn = document.getElementById('export-csv-btn');
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        const snapshot = await db.collection('travelers').orderBy('createdAt', 'desc').get();
        let csvContent = "data:text/csv;charset=utf-8,Name,Email,Date,Step1,Step2,Step3,Status\n";

        snapshot.forEach(doc => {
            const d = doc.data();
            const date = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleDateString() : '';
            const status = (d.step1_completed && d.step2_completed && d.step3_completed) ? 'Completed' : 'In Progress';

            const row = [
                `"${d.name || ''}"`,
                `"${d.email || ''}"`,
                date,
                d.step1_completed ? 'Yes' : 'No',
                d.step2_completed ? 'Yes' : 'No',
                d.step3_completed ? 'Yes' : 'No',
                status
            ].join(",");
            csvContent += row + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "traveler_progress_export.csv");
        document.body.appendChild(link);
        link.click();
    });
}

// Completion Modal Events
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

// Reference Modal Logic
const refModal = document.getElementById('ref-modal');
const closeRefModal = document.getElementById('close-ref-modal');
const closeRefBtn = document.getElementById('close-ref-btn');

// Make function global so onclick works
window.openRefModal = async function (docId) {
    const modalBody = document.getElementById('ref-modal-body');
    modalBody.innerHTML = '<p class="text-center">Loading...</p>';
    refModal.classList.remove('hidden');

    try {
        const doc = await db.collection('travelers').doc(docId).get();
        const data = doc.data();

        if (!data.references || data.references.length === 0) {
            modalBody.innerHTML = '<p>No references found.</p>';
            return;
        }

        let html = '';
        data.references.forEach((ref, index) => {
            html += `
                <div style="background: #f9f9f9; padding: 15px; margin-bottom: 15px; border-radius: 8px;">
                    <h4 style="color: var(--primary-color); border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px;">Reference #${index + 1}</h4>
                    <p><strong>Name:</strong> ${ref.fullName}</p>
                    <p><strong>Title:</strong> ${ref.title}</p>
                    <p><strong>Facility:</strong> ${ref.facility}</p>
                    <p><strong>Phone:</strong> <a href="tel:${ref.phone}">${ref.phone}</a></p>
                    <p><strong>Email:</strong> ${ref.email || 'N/A'}</p>
                </div>
            `;
        });
        modalBody.innerHTML = html;

    } catch (e) {
        modalBody.innerHTML = `<p style="color:red">Error loading references: ${e.message}</p>`;
    }
};

// Close Modal Events
if (closeRefModal) closeRefModal.addEventListener('click', () => refModal.classList.add('hidden'));
if (closeRefBtn) closeRefBtn.addEventListener('click', () => refModal.classList.add('hidden'));
window.addEventListener('click', (e) => {
    if (e.target == refModal) refModal.classList.add('hidden');
    if (e.target == completionModal) {
        completionModal.classList.add('hidden');
    }
});
