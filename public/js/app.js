// ═══════════════════════════════════════════════════════════════════════════
// CampusConnect — Main Application Logic
// ═══════════════════════════════════════════════════════════════════════════

const API = '';

// ── State ────────────────────────────────────────────────────────────────
let currentPage = 'auth';
let staffSession = null;
let currentUser = null;
let authRole = 'student'; // 'student' | 'staff'
let authMode = 'register'; // 'register' | 'login'
let allTickets = [];
let navHistory = [];
let isInitialBoot = true;

// ══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════════════
function navigateTo(page, isBack = false) {
  if (!isBack && !isInitialBoot && currentPage && currentPage !== page) {
    navHistory.push(currentPage);
  }
  isInitialBoot = false;

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  // Toggle navigation bar display: On dedicated auth page, show clean corner layout
  const navWrapper = document.querySelector('.nav-wrapper');
  if (navWrapper) {
    if (page === 'auth') {
      navWrapper.style.display = 'none';
    } else {
      navWrapper.style.display = '';
    }
  }

  // Show target page
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) {
    targetPage.classList.add('active');
    // Re-trigger animation
    targetPage.style.animation = 'none';
    targetPage.offsetHeight;
    targetPage.style.animation = '';
  }

  // Activate nav link
  const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (navLink) navLink.classList.add('active');

  currentPage = page;

  // Update floating back button visibility on left side
  updateGlobalBackButton();

  // Protect staff dashboard if not logged in
  if (page === 'dashboard' && !staffSession) {
    showToast('Please sign in with a staff account to access the operations command center.', 'warning');
    setAuthRole('staff');
    setAuthMode('login');
    navigateTo('auth');
    return;
  }

  // Load data for specific pages
  if (page === 'dashboard' && staffSession) {
    loadDashboard();
  }
  if (page === 'feed') {
    loadPublicFeed();
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigateBack() {
  if (currentPage === 'home' || currentPage === 'auth') {
    updateGlobalBackButton();
    return;
  }

  while (navHistory.length > 0) {
    const prev = navHistory.pop();
    if (prev && prev !== currentPage && prev !== 'auth') {
      navigateTo(prev, true);
      return;
    }
  }

  // Once history is exhausted, stop at home page (the first page when website loads)
  navigateTo('home', true);
}

function updateGlobalBackButton() {
  const btn = document.getElementById('global-back-btn');
  if (!btn) return;

  if (currentPage === 'home' || currentPage === 'auth') {
    btn.classList.add('disabled');
    btn.setAttribute('aria-disabled', 'true');
    btn.setAttribute('tabindex', '-1');
  } else {
    btn.classList.remove('disabled');
    btn.removeAttribute('aria-disabled');
    btn.setAttribute('tabindex', '0');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 4000);
}

// ══════════════════════════════════════════════════════════════════════════
// PHOTO UPLOAD
// ══════════════════════════════════════════════════════════════════════════
const photoInput = document.getElementById('photo');
const photoZone = document.getElementById('photo-zone');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewImg = document.getElementById('photo-preview-img');

if (photoInput) {
  photoInput.addEventListener('change', handlePhotoSelect);
}

if (photoZone) {
  photoZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    photoZone.classList.add('dragover');
  });
  photoZone.addEventListener('dragleave', () => {
    photoZone.classList.remove('dragover');
  });
  photoZone.addEventListener('drop', (e) => {
    e.preventDefault();
    photoZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      photoInput.files = e.dataTransfer.files;
      handlePhotoSelect();
    }
  });
}

function handlePhotoSelect() {
  const file = photoInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      photoPreviewImg.src = e.target.result;
      photoPreview.style.display = 'inline-block';
      photoZone.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
}

function removePhoto() {
  photoInput.value = '';
  photoPreview.style.display = 'none';
  photoZone.style.display = 'block';
}

// ══════════════════════════════════════════════════════════════════════════
// COMPLAINT SUBMISSION
// ══════════════════════════════════════════════════════════════════════════
const complaintForm = document.getElementById('complaint-form');
if (complaintForm) {
  complaintForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-btn');
    const resultDiv = document.getElementById('submission-result');

    // Validate
    const name = document.getElementById('student_name').value.trim();
    const email = document.getElementById('student_email').value.trim();
    const complaint = document.getElementById('complaint_text').value.trim();
    const location = document.getElementById('location').value.trim();

    if (!name || !email || !complaint || !location) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Analyzing with Gemini AI...`;

    const formData = new FormData(complaintForm);

    try {
      const res = await fetch(`${API}/api/tickets`, { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to submit');

      // Show result
      complaintForm.style.display = 'none';
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = renderSubmissionResult(data.ticket);

      // Refresh community feed in the background so new ticket is immediately present
      loadPublicFeed();

      showToast('Complaint submitted successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to submit complaint.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="m22 2-7 20-4-9-9-4z"/><path d="m22 2-11 11"/></svg>
        Submit Issue — Run AI Triage.`;
    }
  });
}

function renderSubmissionResult(ticket) {
  const dupHtml = ticket.duplicates && ticket.duplicates.length > 0
    ? `<div class="ai-duplicate-warning">
         <div class="label">⚠️ Possible Duplicate Reports Detected</div>
         <p style="font-size:0.85rem;color:var(--text-secondary);">
           ${ticket.duplicates.map(d =>
             `Ticket <strong>${d.ticket_number}</strong> — ${Math.round(d.similarity_score * 100)}% similar (${d.reason})`
           ).join('<br>')}
         </p>
         <p style="font-size:0.78rem;color:var(--text-muted);margin-top:var(--space-2);">Staff will review and merge if needed. Your ticket has still been created.</p>
       </div>` : '';

  const missingHtml = ticket.ai_missing_info
    ? `<div class="ai-missing-info">
         <div class="label">💡 Missing Information</div>
         <p style="font-size:0.85rem;color:var(--text-secondary);">${ticket.ai_missing_info}</p>
       </div>` : '';

  return `
    <div class="ai-result">
      <div class="ai-result-header">
        <div class="ai-result-icon">✨</div>
        <div>
          <div class="ai-result-title">Ticket Created Successfully</div>
          <div class="ai-result-subtitle">Gemini AI has analyzed your complaint</div>
        </div>
      </div>

      <div class="ticket-number-display">
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:var(--space-2);text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Your Ticket Number</div>
        <div class="number">${ticket.ticket_number}</div>
        <p>Save this number to track your ticket's progress.</p>
      </div>

      <div class="ai-result-grid" style="margin-top:var(--space-6);">
        <div class="ai-result-item">
          <div class="label">AI Summary</div>
          <div class="value">${ticket.ai_summary}</div>
        </div>
        <div class="ai-result-item">
          <div class="label">Category</div>
          <div class="value">${ticket.ai_category}</div>
        </div>
        <div class="ai-result-item">
          <div class="label">Routed To</div>
          <div class="value">${ticket.ai_department}</div>
        </div>
        <div class="ai-result-item">
          <div class="label">Priority</div>
          <div class="value"><span class="badge badge-${ticket.ai_priority}">${ticket.ai_priority}</span></div>
        </div>
      </div>

      ${ticket.suggested_action ? `
        <div class="ai-result-item" style="margin-top:var(--space-4);">
          <div class="label">Suggested Action</div>
          <div class="value">${ticket.suggested_action}</div>
        </div>
      ` : ''}

      ${missingHtml}
      ${dupHtml}

      <div style="display:flex;gap:var(--space-4);margin-top:var(--space-6);flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="navigateTo('track');document.getElementById('track-input').value='${ticket.ticket_number}';trackTicket();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Track This Ticket
        </button>
        <button class="btn btn-secondary-editorial" onclick="navigateTo('feed')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          View in Community Feed
        </button>
        <button class="btn btn-secondary" onclick="resetForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Submit Another
        </button>
      </div>
    </div>`;
}

function resetForm() {
  const form = document.getElementById('complaint-form');
  const resultDiv = document.getElementById('submission-result');
  form.reset();
  form.style.display = 'block';
  resultDiv.style.display = 'none';
  removePhoto();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════════════════════════════════════════════
// TICKET TRACKING (Student)
// ══════════════════════════════════════════════════════════════════════════
document.getElementById('track-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') trackTicket();
});

async function trackTicket() {
  const input = document.getElementById('track-input');
  const resultDiv = document.getElementById('track-result');
  const ticketNumber = input.value.trim().toUpperCase();

  if (!ticketNumber) {
    showToast('Please enter a ticket number.', 'warning');
    return;
  }

  resultDiv.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <div class="loading-text">Looking up ticket ${ticketNumber}...</div>
    </div>`;

  try {
    const res = await fetch(`${API}/api/tickets/track/${ticketNumber}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    resultDiv.innerHTML = renderTrackResult(data.ticket, data.history);
  } catch (err) {
    resultDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>Ticket Not Found</h3>
        <p>${err.message || 'Please check the ticket number and try again.'}</p>
      </div>`;
  }
}

function renderTrackResult(ticket, history) {
  const statusSteps = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
  const currentIndex = statusSteps.indexOf(ticket.status);
  const fillPercent = currentIndex >= 0 ? (currentIndex / (statusSteps.length - 1)) * 100 : 0;

  const pipelineHtml = `
    <div class="pipeline-container">
      <div class="pipeline-track"></div>
      <div class="pipeline-fill" style="width: ${fillPercent}%;"></div>
      ${statusSteps.map((s, i) => {
        const isDone = i < currentIndex;
        const isCurrent = s === ticket.status;
        const nodeClass = isDone ? 'done' : (isCurrent ? 'current' : 'pending');
        return `
          <div class="pipeline-step">
            <div class="pipeline-node ${nodeClass}">
              ${isDone ? '✓' : i + 1}
            </div>
            <div class="pipeline-label ${isDone || isCurrent ? 'active' : ''}">
              ${s.replace('_', ' ')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  const timelineHtml = history.map(h => `
    <div class="timeline-item ${h.action}">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-action">${formatAction(h.action)}</div>
        <div class="timeline-details">${h.details}</div>
        <div class="timeline-time">${formatDate(h.created_at)} — by ${h.performed_by}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="ai-result">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-3);margin-bottom:var(--space-6);">
        <div>
          <div style="font-family:var(--font-mono);font-size:1.25rem;font-weight:800;color:var(--secondary-active);letter-spacing:0.04em;">${ticket.ticket_number}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">Submitted ${formatDate(ticket.created_at)}</div>
        </div>
        <span class="badge badge-${ticket.status}" style="font-size:0.82rem;padding:4px 14px;">${ticket.status.replace('_', ' ')}</span>
      </div>

      <!-- High-Tech Interactive Pipeline -->
      ${pipelineHtml}

      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Category</div>
          <div class="detail-value">${ticket.ai_category || 'Pending'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Department</div>
          <div class="detail-value">${ticket.ai_department || 'Pending'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Priority</div>
          <div class="detail-value"><span class="badge badge-${ticket.ai_priority}">${ticket.ai_priority}</span></div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Assigned To</div>
          <div class="detail-value">${ticket.assigned_to || 'Not yet assigned'}</div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">📝 AI Summary</div>
        <p>${ticket.ai_summary || 'Processing...'}</p>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">💬 Original Complaint</div>
        <p>${ticket.complaint_text}</p>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">📍 Location</div>
        <p>${ticket.location}${ticket.building ? `, ${ticket.building}` : ''}${ticket.floor ? `, ${ticket.floor}` : ''}${ticket.room ? `, ${ticket.room}` : ''}</p>
      </div>

      ${ticket.photo_path ? `
        <div class="detail-section">
          <div class="detail-section-title">📷 Photo</div>
          <img src="${ticket.photo_path}" class="complaint-photo" alt="Complaint photo">
        </div>
      ` : ''}

      ${ticket.staff_notes ? `
        <div class="detail-section">
          <div class="detail-section-title">🗒️ Staff Notes</div>
          <p>${ticket.staff_notes}</p>
        </div>
      ` : ''}

      ${ticket.ai_missing_info ? `
        <div class="ai-missing-info" style="margin-bottom:var(--space-6);">
          <div class="label">💡 Additional Info Requested</div>
          <p style="font-size:0.85rem;color:var(--text-secondary);">${ticket.ai_missing_info}</p>
        </div>
      ` : ''}

      <div class="detail-section">
        <div class="detail-section-title">📜 Progress History</div>
        <div class="timeline">
          ${timelineHtml || '<p style="color:var(--text-muted);font-size:0.85rem;">No history entries yet.</p>'}
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// CAMPUS ISSUES FEED & UPVOTES (Community Board)
// ══════════════════════════════════════════════════════════════════════════
let feedSearchTimeout = null;
let feedActiveCategory = 'all';

function debounceFeedSearch() {
  clearTimeout(feedSearchTimeout);
  feedSearchTimeout = setTimeout(() => {
    loadPublicFeed();
  }, 280);
}

function setFeedCategory(cat) {
  feedActiveCategory = cat;
  const select = document.getElementById('feed-category');
  if (select) select.value = cat;

  // Update active chip UI
  document.querySelectorAll('.cat-chip').forEach(chip => {
    if (chip.textContent.includes(cat) || (cat === 'all' && chip.textContent.includes('All'))) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  loadPublicFeed();
}

function getUpvotedTickets() {
  try {
    return JSON.parse(localStorage.getItem('campus_upvoted_tickets') || '[]');
  } catch (e) {
    return [];
  }
}

function setUpvotedTickets(list) {
  try {
    localStorage.setItem('campus_upvoted_tickets', JSON.stringify(list));
  } catch (e) {}
}

async function loadPublicFeed() {
  const container = document.getElementById('feed-container') || document.getElementById('feed-grid');
  const emptyState = document.getElementById('feed-empty');
  if (!container) return;

  const categorySelect = document.getElementById('feed-category');
  const sortSelect = document.getElementById('feed-sort');
  const searchInput = document.getElementById('feed-search');

  const category = categorySelect ? categorySelect.value : feedActiveCategory;
  const sort = sortSelect ? sortSelect.value : 'newest';
  const search = searchInput ? searchInput.value.trim() : '';

  // Show loading spinner
  container.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; padding: var(--space-12);">
      <div class="spinner" style="margin: 0 auto var(--space-4);"></div>
      <div style="color: var(--text-muted); font-size: 0.9rem;">Fetching campus maintenance reports...</div>
    </div>`;
  if (emptyState) emptyState.style.display = 'none';

  try {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    if (sort) params.append('sort', sort);
    if (search) params.append('search', search);

    const res = await fetch(`${API}/api/public/tickets?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load campus feed');

    const tickets = data.tickets || [];
    const upvotedIds = new Set(getUpvotedTickets());

    if (tickets.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    container.innerHTML = tickets.map(ticket => renderFeedCard(ticket, upvotedIds.has(ticket.id))).join('');
  } catch (err) {
    console.error('Error loading public feed:', err);
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: var(--space-8); color: var(--danger-400);">
        ❌ Failed to load complaints feed. Please try again.
      </div>`;
  }
}

function renderFeedCard(ticket, isUpvoted) {
  const upvotes = ticket.upvotes || 0;
  const isTrending = upvotes >= 10;
  const safeSummary = escapeHtml(ticket.ai_summary || ticket.complaint_text || 'Campus Maintenance Report');
  const safeSnippet = escapeHtml(ticket.complaint_text || '');
  const safeLocation = escapeHtml(`${ticket.location || 'Campus'}${ticket.building ? ` • ${ticket.building}` : ''}${ticket.room ? ` (${ticket.room})` : ''}`);
  const safeCategory = escapeHtml(ticket.ai_category || 'Maintenance');
  const safeDept = escapeHtml(ticket.ai_department || 'Facilities');
  const safeReporter = escapeHtml(ticket.student_name || 'Student');
  const priority = ticket.ai_priority || 'medium';
  const status = ticket.status || 'open';
  const statusLabel = status.replace(/_/g, ' ');

  return `
    <div class="feed-card" id="feed-card-${ticket.id}">
      <div>
        <div class="feed-card-header">
          <div class="feed-badges-left">
            <span class="badge badge-category">
              ${safeCategory}
            </span>
            <span class="badge badge-${priority}">${priority}</span>
            ${isTrending ? `<span class="feed-trending-pill">🔥 ${upvotes} Impact</span>` : ''}
          </div>
          <span class="badge badge-${status}">${statusLabel}</span>
        </div>

        <div class="feed-location">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${safeLocation}
        </div>

        <h3 class="feed-title">${safeSummary}</h3>

        <div class="feed-complaint-snippet">
          "${safeSnippet.length > 170 ? safeSnippet.substring(0, 170) + '...' : safeSnippet}"
        </div>

        ${ticket.photo_path ? `
          <img src="${ticket.photo_path}" class="feed-photo-thumb" alt="Complaint evidence" onclick="window.open('${ticket.photo_path}', '_blank')" title="Click to view full photo">
        ` : ''}

        <div style="font-size: 0.74rem; color: var(--text-muted); margin-bottom: var(--space-3); display: flex; align-items: center; gap: 6px;">
          <span>🎯 Assigned Team:</span>
          <span style="color: var(--text-secondary); font-weight: 600;">${safeDept}</span>
        </div>
      </div>

      <div class="feed-card-footer">
        <div class="feed-meta-text">
          Reported by <strong>${safeReporter}</strong><br>
          ${formatDate(ticket.created_at)}
        </div>

        <div class="feed-actions">
          <button class="upvote-btn ${isUpvoted ? 'active upvoted' : ''}" 
                  id="upvote-btn-${ticket.id}" 
                  onclick="upvoteTicket('${ticket.id}', event)" 
                  title="Upvote if you are also experiencing this issue">
            <svg viewBox="0 0 24 24" fill="${isUpvoted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
            <span class="upvote-label">${isUpvoted ? 'Upvoted' : 'Upvote'}</span>
            <span class="upvote-count" id="upvote-count-${ticket.id}">${upvotes}</span>
          </button>

          <button class="track-btn-small" onclick="quickTrack('${ticket.ticket_number}')" title="Track issue progress and resolution timeline">
            ${ticket.ticket_number} →
          </button>
        </div>
      </div>
    </div>`;
}

async function upvoteTicket(ticketId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const btn = document.getElementById(`upvote-btn-${ticketId}`);
  const countEl = document.getElementById(`upvote-count-${ticketId}`);
  if (!btn) return;

  const upvotedList = getUpvotedTickets();
  const alreadyUpvoted = upvotedList.includes(ticketId);
  const action = alreadyUpvoted ? 'remove' : 'upvote';

  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/tickets/${ticketId}/upvote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update upvote');

    const newUpvotes = data.upvotes;
    if (countEl) countEl.textContent = newUpvotes;

    const labelEl = btn.querySelector('.upvote-label');
    const svgEl = btn.querySelector('svg');

    if (action === 'upvote') {
      btn.classList.add('active', 'upvoted');
      if (labelEl) labelEl.textContent = 'I have this too';
      if (svgEl) svgEl.setAttribute('fill', 'currentColor');
      setUpvotedTickets([...upvotedList, ticketId]);
      showToast(`Upvoted! ${newUpvotes} students have confirmed this issue.`, 'success');
    } else {
      btn.classList.remove('active', 'upvoted');
      if (labelEl) labelEl.textContent = 'Me too';
      if (svgEl) svgEl.setAttribute('fill', 'none');
      setUpvotedTickets(upvotedList.filter(id => id !== ticketId));
      showToast('Upvote removed.', 'info');
    }
  } catch (err) {
    showToast(err.message || 'Could not update upvote.', 'error');
  } finally {
    btn.disabled = false;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════════════════════════════════
// UNIFIED AUTHENTICATION (STUDENTS & STAFF)
// ══════════════════════════════════════════════════════════════════════════

function triggerTextMorph(el) {
  if (!el) return;
  el.classList.remove('text-morph');
  void el.offsetWidth; // Force reflow
  el.classList.add('text-morph');
}

function updateAuthFieldsVisibility() {
  const nameGroup = document.getElementById('auth-group-name');
  const studentFields = document.getElementById('auth-student-extra-fields');
  const staffFields = document.getElementById('auth-staff-extra-fields');

  if (authMode === 'register') {
    if (nameGroup) nameGroup.classList.add('expanded');
    if (authRole === 'student') {
      if (studentFields) studentFields.classList.add('expanded');
      if (staffFields) staffFields.classList.remove('expanded');
    } else {
      if (studentFields) studentFields.classList.remove('expanded');
      if (staffFields) staffFields.classList.add('expanded');
    }
  } else {
    // Sign In Mode
    if (nameGroup) nameGroup.classList.remove('expanded');
    if (studentFields) studentFields.classList.remove('expanded');
    if (staffFields) staffFields.classList.remove('expanded');
  }
}

function setAuthRole(role) {
  authRole = role;
  const pillStudent = document.getElementById('auth-role-student') || document.getElementById('pill-role-student');
  const pillStaff = document.getElementById('auth-role-staff') || document.getElementById('pill-role-staff');
  const roleTag = document.getElementById('auth-role-tag');
  const cardTitle = document.getElementById('auth-title');
  const cardSub = document.getElementById('auth-subtitle');
  const submitText = document.getElementById('auth-submit-text');

  if (role === 'staff') {
    if (pillStaff) pillStaff.classList.add('active');
    if (pillStudent) pillStudent.classList.remove('active');
    if (roleTag) {
      roleTag.textContent = 'STAFF OPERATIONS PORTAL';
      triggerTextMorph(roleTag);
    }
    if (cardTitle) {
      cardTitle.innerHTML = authMode === 'register' 
        ? 'Staff Registration<span class="heading-period">.</span>' 
        : 'Staff Sign In<span class="heading-period">.</span>';
      triggerTextMorph(cardTitle);
    }
    if (cardSub) {
      cardSub.textContent = authMode === 'register' 
        ? 'Create facility staff credentials to triage tickets, manage repairs, and update status.' 
        : 'Sign in to access the maintenance dashboard, operational KPIs, and dispatch queue.';
      triggerTextMorph(cardSub);
    }
    if (submitText) {
      submitText.textContent = authMode === 'register' 
        ? 'Complete Staff Registration.' 
        : 'Sign In to Staff Portal.';
      triggerTextMorph(submitText);
    }
  } else {
    if (pillStudent) pillStudent.classList.add('active');
    if (pillStaff) pillStaff.classList.remove('active');
    if (roleTag) {
      roleTag.textContent = 'STUDENT PORTAL';
      triggerTextMorph(roleTag);
    }
    if (cardTitle) {
      cardTitle.innerHTML = authMode === 'register' 
        ? 'Student Registration<span class="heading-period">.</span>' 
        : 'Student Sign In<span class="heading-period">.</span>';
      triggerTextMorph(cardTitle);
    }
    if (cardSub) {
      cardSub.textContent = authMode === 'register' 
        ? 'Create an account to submit complaints, upvote campus fixes, and track repairs live.' 
        : 'Sign in to track your submissions, upvote campus complaints, and receive instant updates.';
      triggerTextMorph(cardSub);
    }
    if (submitText) {
      submitText.textContent = authMode === 'register' 
        ? 'Complete Student Registration.' 
        : 'Sign In to Student Portal.';
      triggerTextMorph(submitText);
    }
  }

  updateAuthFieldsVisibility();
}

function setAuthMode(mode) {
  authMode = mode;
  const tabReg = document.getElementById('auth-mode-register') || document.getElementById('tab-mode-register');
  const tabLogin = document.getElementById('auth-mode-login') || document.getElementById('tab-mode-login');
  const cardTitle = document.getElementById('auth-title');
  const cardSub = document.getElementById('auth-subtitle');
  const submitText = document.getElementById('auth-submit-text');
  const footerNote = document.getElementById('auth-footer-note');

  if (mode === 'login') {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabReg) tabReg.classList.remove('active');
    if (cardTitle) {
      cardTitle.innerHTML = (authRole === 'staff' ? 'Staff Sign In' : 'Student Sign In') + '<span class="heading-period">.</span>';
      triggerTextMorph(cardTitle);
    }
    if (cardSub) {
      cardSub.textContent = authRole === 'staff' 
        ? 'Sign in to access the maintenance dashboard, operational KPIs, and dispatch queue.' 
        : 'Sign in to track your submissions, upvote campus complaints, and receive instant updates.';
      triggerTextMorph(cardSub);
    }
    if (submitText) {
      submitText.textContent = authRole === 'staff' ? 'Sign In to Staff Portal.' : 'Sign In to Student Portal.';
      triggerTextMorph(submitText);
    }
    if (footerNote) {
      footerNote.innerHTML = '<span>Need a new account?</span><button type="button" class="auth-link-btn" onclick="setAuthMode(\'register\')">Register here</button>';
    }
  } else {
    if (tabReg) tabReg.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
    if (cardTitle) {
      cardTitle.innerHTML = (authRole === 'staff' ? 'Staff Registration' : 'Student Registration') + '<span class="heading-period">.</span>';
      triggerTextMorph(cardTitle);
    }
    if (cardSub) {
      cardSub.textContent = authRole === 'staff' 
        ? 'Create facility staff credentials to triage tickets, manage repairs, and update status.' 
        : 'Create an account to submit complaints, upvote campus fixes, and track repairs live.';
      triggerTextMorph(cardSub);
    }
    if (submitText) {
      submitText.textContent = authRole === 'staff' ? 'Complete Staff Registration.' : 'Complete Student Registration.';
      triggerTextMorph(submitText);
    }
    if (footerNote) {
      footerNote.innerHTML = '<span>Already registered?</span><button type="button" class="auth-link-btn" onclick="setAuthMode(\'login\')">Sign In instead</button>';
    }
  }

  updateAuthFieldsVisibility();
}

function toggleAuthPassword() {
  const passInput = document.getElementById('auth-password');
  if (!passInput) return;
  passInput.type = passInput.type === 'password' ? 'text' : 'password';
}

function quickFillAuth(role, email, pass) {
  setAuthRole(role);
  setAuthMode('login');
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  if (emailInput) emailInput.value = email;
  if (passInput) passInput.value = pass;
  const form = document.getElementById('auth-form');
  if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('auth-submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  const email = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value.trim();
  const name = document.getElementById('auth-name')?.value.trim();
  const phone = document.getElementById('auth-student-phone')?.value.trim() || '';
  const studentDept = document.getElementById('auth-student-dept')?.value.trim() || '';
  const staffDept = document.getElementById('auth-staff-dept')?.value || 'General Maintenance';
  const staffRole = document.getElementById('auth-staff-role')?.value || 'staff';

  try {
    if (authMode === 'register') {
      if (!name) throw new Error('Please enter your full name.');
      if (!email) throw new Error('Please enter your email address.');
      if (!password || password.length < 4) throw new Error('Password must be at least 4 characters long.');

      const payload = {
        role: authRole,
        name,
        email,
        password,
        phone,
        department: authRole === 'staff' ? staffDept : studentDept,
        staffRole
      };

      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');

      applyLoggedInUser(data.user, authRole, true);
    } else {
      if (!email || !password) throw new Error('Please enter both email and password.');

      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: authRole, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign in failed.');

      applyLoggedInUser(data.user, authRole, false);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function applyLoggedInUser(user, role, isRegistration = false) {
  currentUser = { ...user, role };
  localStorage.setItem('campus_connect_user', JSON.stringify(currentUser));

  updateNavUserUI();

  if (role === 'student') {
    // Student goes to their respective page (Student Portal)
    const nameInput = document.getElementById('student_name');
    const emailInput = document.getElementById('student_email');
    const phoneInput = document.getElementById('student_phone');
    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (phoneInput && user.phone) phoneInput.value = user.phone;

    showToast(
      isRegistration 
        ? `🎉 Welcome, ${user.name}! Student registration complete.` 
        : `Welcome back, ${user.name}!`, 
      'success'
    );
    navigateTo('home');
  } else {
    // Staff goes to their respective page (Staff Dashboard)
    staffSession = user;
    localStorage.setItem('campus_connect_staff', JSON.stringify(staffSession));

    const loginDiv = document.getElementById('staff-login');
    const dashDiv = document.getElementById('staff-dashboard');
    const nameDisp = document.getElementById('staff-name-display');
    if (loginDiv) loginDiv.style.display = 'none';
    if (dashDiv) dashDiv.style.display = 'block';
    if (nameDisp) nameDisp.textContent = user.name;

    showToast(
      isRegistration 
        ? `🎉 Welcome, ${user.name}! Staff registration complete.` 
        : `Welcome to Staff Command Center, ${user.name}!`, 
      'success'
    );
    navigateTo('dashboard');
    loadDashboard();
  }
}

function updateNavUserUI() {
  const profileDiv = document.getElementById('nav-user-profile');
  const badgeEl = document.getElementById('nav-user-badge');
  const loginBtn = document.getElementById('nav-auth-login-btn');
  const avatarInit = document.getElementById('nav-user-avatar-initial');

  if (currentUser) {
    if (profileDiv) profileDiv.style.display = 'inline-flex';
    if (loginBtn) loginBtn.style.display = 'none';
    if (avatarInit) avatarInit.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();

    if (currentUser.role === 'staff' || currentUser.role === 'admin' || currentUser.role === 'supervisor') {
      badgeEl.textContent = `${currentUser.name} (${currentUser.role === 'admin' ? 'Admin' : 'Staff'})`;
      badgeEl.style.cursor = 'pointer';
      badgeEl.title = 'Go to Staff Operations Dashboard';
      badgeEl.onclick = () => navigateTo('dashboard');
    } else {
      badgeEl.textContent = `${currentUser.name} (Student)`;
      badgeEl.style.cursor = 'pointer';
      badgeEl.title = 'Go to Student Portal';
      badgeEl.onclick = () => navigateTo('home');
    }
  } else {
    if (profileDiv) profileDiv.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'inline-flex';
  }
}

function authLogout() {
  currentUser = null;
  staffSession = null;
  localStorage.removeItem('campus_connect_user');
  localStorage.removeItem('campus_connect_staff');

  const loginDiv = document.getElementById('staff-login');
  const dashDiv = document.getElementById('staff-dashboard');
  if (loginDiv) loginDiv.style.display = 'block';
  if (dashDiv) dashDiv.style.display = 'none';

  updateNavUserUI();
  setAuthMode('register');
  navigateTo('auth');
  showToast('Signed out successfully.', 'info');
}

// ══════════════════════════════════════════════════════════════════════════
// STAFF LOGIN / LOGOUT (LEGACY FALLBACK)
// ══════════════════════════════════════════════════════════════════════════
async function staffLogin(e) {
  e.preventDefault();
  const email = document.getElementById('staff-email').value;
  const password = document.getElementById('staff-password').value;

  try {
    const res = await fetch(`${API}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    staffSession = data.staff;
    localStorage.setItem('campus_connect_staff', JSON.stringify(staffSession));
    document.getElementById('staff-login').style.display = 'none';
    document.getElementById('staff-dashboard').style.display = 'block';
    document.getElementById('staff-name-display').textContent = staffSession.name;

    showToast(`Welcome, ${staffSession.name}!`, 'success');
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Login failed.', 'error');
  }
}

function staffLogout() {
  staffSession = null;
  localStorage.removeItem('campus_connect_staff');
  document.getElementById('staff-login').style.display = 'block';
  document.getElementById('staff-dashboard').style.display = 'none';
  showToast('Logged out successfully.', 'info');
}

function quickStaffLogin(email, password) {
  const emailInput = document.getElementById('staff-email');
  const passInput = document.getElementById('staff-password');
  if (emailInput) emailInput.value = email;
  if (passInput) passInput.value = password;
  const form = document.querySelector('#staff-login form');
  if (form) {
    staffLogin(new Event('submit', { cancelable: true }));
  }
}

// ══════════════════════════════════════════════════════════════════════════
// STAFF DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
async function loadDashboard() {
  await Promise.all([loadStats(), loadTickets()]);
}

async function loadStats() {
  try {
    const res = await fetch(`${API}/api/staff/stats`);
    const data = await res.json();
    renderStats(data);
    renderCharts(data);
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function animateKpiValue(el, targetVal) {
  if (!el) return;
  const current = parseInt(el.textContent, 10);
  if (isNaN(current) || current === targetVal) {
    el.textContent = targetVal;
    return;
  }
  const diff = targetVal - current;
  const duration = 350;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    el.textContent = Math.round(current + diff * ease);
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = targetVal;
    }
  }
  requestAnimationFrame(step);
}

function renderStats(stats) {
  if (!stats) return;

  // 1. Update Top Metric KPI Cards on Staff Dashboard
  const elTotal = document.getElementById('kpi-total');
  if (elTotal) animateKpiValue(elTotal, stats.total ?? 0);

  const elOpen = document.getElementById('kpi-open');
  if (elOpen) animateKpiValue(elOpen, (stats.open || 0) + (stats.assigned || 0));

  const elCrit = document.getElementById('kpi-critical');
  if (elCrit) animateKpiValue(elCrit, stats.critical ?? 0);

  const elDups = document.getElementById('kpi-duplicates');
  if (elDups) animateKpiValue(elDups, stats.flaggedDuplicates ?? stats.duplicate ?? 0);

  // 2. Update Triage Quick Filter Pill Numbers
  const cAll = document.getElementById('count-all');
  if (cAll) cAll.textContent = stats.total ?? 0;

  const cCrit = document.getElementById('count-critical');
  if (cCrit) cCrit.textContent = stats.critical ?? 0;

  const cDups = document.getElementById('count-dups');
  if (cDups) cDups.textContent = stats.flaggedDuplicates ?? stats.duplicate ?? 0;

  const cProg = document.getElementById('count-inprogress');
  if (cProg) cProg.textContent = (stats.inProgress || 0) + (stats.assigned || 0);

  const cRes = document.getElementById('count-resolved');
  if (cRes) cRes.textContent = (stats.resolved || 0) + (stats.closed || 0);

  // 3. Fallback for legacy dashboard-stats container if present
  const container = document.getElementById('dashboard-stats');
  if (container) {
    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-title">Total Tickets</div>
        <div class="stat-card-value">${stats.total}</div>
        <div class="stat-card-badge" style="color:var(--secondary-active);">● Active Load</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Open</div>
        <div class="stat-card-value" style="color:#3b82f6;">${stats.open}</div>
        <div class="stat-card-badge" style="color:#3b82f6;">● Awaiting Triage</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">In Progress</div>
        <div class="stat-card-value" style="color:#f59e0b;">${stats.inProgress + stats.assigned}</div>
        <div class="stat-card-badge" style="color:#f59e0b;">● Technicians Active</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Resolved</div>
        <div class="stat-card-value" style="color:#10b981;">${stats.resolved}</div>
        <div class="stat-card-badge" style="color:#10b981;">✓ Successfully Closed</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Critical / High</div>
        <div class="stat-card-value" style="color:#ef4444;">${stats.critical + stats.high}</div>
        <div class="stat-card-badge" style="color:#ef4444;">🚨 Urgent Action</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Flagged Duplicates</div>
        <div class="stat-card-value" style="color:#8b5cf6;">${stats.flaggedDuplicates}</div>
        <div class="stat-card-badge" style="color:#8b5cf6;">⚠️ AI Match Detected</div>
      </div>`;
  }
}

function renderCharts(stats) {
  const container = document.getElementById('dashboard-charts');
  if (!container || !stats || !stats.byCategory || !stats.byDepartment) return;

  const maxCat = Math.max(...stats.byCategory.map(c => c.count), 1);
  const maxDept = Math.max(...stats.byDepartment.map(d => d.count), 1);

  const catBars = stats.byCategory.map(c => `
    <div class="bar-row">
      <div class="bar-label" title="${c.category}">${c.category}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.max((c.count / maxCat) * 100, 6)}%"></div>
      </div>
      <div class="bar-count">${c.count}</div>
    </div>
  `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem;">No data yet</p>';

  const deptBars = stats.byDepartment.map(d => `
    <div class="bar-row">
      <div class="bar-label" title="${d.department}">${d.department}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.max((d.count / maxDept) * 100, 6)}%"></div>
      </div>
      <div class="bar-count">${d.count}</div>
    </div>
  `).join('') || '<p style="color:var(--text-muted);font-size:0.85rem;">No data yet</p>';

  container.innerHTML = `
    <div class="chart-card">
      <div class="chart-title">Tickets by Category</div>
      <div class="bar-chart">${catBars}</div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Tickets by Department</div>
      <div class="bar-chart">${deptBars}</div>
    </div>`;
}

async function loadTickets() {
  try {
    const status = document.getElementById('filter-status')?.value || 'all';
    const priority = document.getElementById('filter-priority')?.value || '';
    const search = document.getElementById('ticket-search')?.value || '';

    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (priority) params.set('priority', priority);
    if (search) params.set('search', search);

    const res = await fetch(`${API}/api/staff/tickets?${params}`);
    const data = await res.json();
    allTickets = data.tickets;
    renderTicketTable(allTickets);
  } catch (err) {
    console.error('Failed to load tickets:', err);
    showToast('Failed to load tickets.', 'error');
  }
}

function filterTickets() {
  loadTickets();
}

function renderTicketTable(tickets) {
  const tbody = document.getElementById('tickets-tbody');
  const emptyState = document.getElementById('tickets-empty');

  if (!tickets || tickets.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  tbody.innerHTML = tickets.map(t => {
    const hasDup = t.duplicate_score >= 0.6 && t.status !== 'duplicate';
    return `
      <tr class="${hasDup ? 'has-duplicate' : ''}" onclick="openTicketModal('${t.id}')">
        <td><span class="ticket-id">${t.ticket_number}</span></td>
        <td>
          <div class="ticket-summary">${t.ai_summary || t.complaint_text.substring(0, 80) + '...'}</div>
          ${hasDup ? '<span class="duplicate-flag">⚠ Possible Dup</span>' : ''}
        </td>
        <td style="font-size:0.8rem;">${t.ai_category || '—'}</td>
        <td style="font-size:0.8rem;">${t.ai_department || '—'}</td>
        <td><span class="badge badge-${t.ai_priority}">${t.ai_priority}</span></td>
        <td><span class="badge badge-${t.status}">${t.status.replace('_', ' ')}</span></td>
        <td style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;">${formatDate(t.created_at)}</td>
      </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════
// TICKET DETAIL MODAL (Staff)
// ══════════════════════════════════════════════════════════════════════════
async function openTicketModal(ticketId) {
  const modal = document.getElementById('ticket-modal');
  const modalBody = document.getElementById('modal-body');

  modal.classList.add('active');
  modalBody.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <div class="loading-text">Loading ticket details...</div>
    </div>`;

  try {
    const res = await fetch(`${API}/api/staff/tickets/${ticketId}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    document.getElementById('modal-ticket-number').textContent = data.ticket.ticket_number;
    document.getElementById('modal-ticket-date').textContent = `Submitted ${formatDate(data.ticket.created_at)} by ${data.ticket.student_name}`;

    modalBody.innerHTML = renderTicketDetail(data.ticket, data.history);
  } catch (err) {
    modalBody.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

function renderTicketDetail(ticket, history) {
  let aiAnalysis = {};
  try { aiAnalysis = JSON.parse(ticket.ai_analysis || '{}'); } catch (e) { /* ignore */ }

  let duplicateInfo = [];
  try { duplicateInfo = JSON.parse(ticket.duplicate_of || '[]'); } catch (e) { /* ignore */ }

  const timelineHtml = history.map(h => `
    <div class="timeline-item ${h.action}">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-action">${formatAction(h.action)}</div>
        <div class="timeline-details">${h.details}</div>
        <div class="timeline-time">${formatDate(h.created_at)} — by ${h.performed_by}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">Student</div>
        <div class="detail-value">${ticket.student_name}<br><span style="font-size:0.78rem;color:var(--text-muted);">${ticket.student_email}</span></div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Location</div>
        <div class="detail-value">${ticket.location}${ticket.building ? `<br>${ticket.building}` : ''}${ticket.floor ? `, ${ticket.floor}` : ''}${ticket.room ? `, ${ticket.room}` : ''}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Category</div>
        <div class="detail-value">${ticket.ai_category || 'Uncategorized'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Department</div>
        <div class="detail-value">${ticket.ai_department || 'Unassigned'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Priority</div>
        <div class="detail-value"><span class="badge badge-${ticket.ai_priority}">${ticket.ai_priority}</span></div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Status</div>
        <div class="detail-value"><span class="badge badge-${ticket.status}">${ticket.status.replace('_', ' ')}</span></div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">🤖 AI Summary</div>
      <div class="detail-text">${ticket.ai_summary || 'No summary available'}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">💬 Original Complaint</div>
      <div class="detail-text">${ticket.complaint_text}</div>
    </div>

    ${aiAnalysis.key_details ? `
      <div class="detail-section">
        <div class="detail-section-title">🔑 Key Details</div>
        <div class="detail-text">${aiAnalysis.key_details}</div>
      </div>
    ` : ''}

    ${aiAnalysis.suggested_action ? `
      <div class="detail-section">
        <div class="detail-section-title">💡 AI Suggested Action</div>
        <div class="detail-text">${aiAnalysis.suggested_action}</div>
      </div>
    ` : ''}

    ${ticket.ai_missing_info ? `
      <div class="ai-missing-info">
        <div class="label">📋 Missing Information</div>
        <p style="font-size:0.85rem;color:var(--text-secondary);">${ticket.ai_missing_info}</p>
      </div>
    ` : ''}

    ${duplicateInfo.length > 0 ? `
      <div class="ai-duplicate-warning" style="margin-top:var(--space-4);">
        <div class="label">⚠️ Potential Duplicates</div>
        ${duplicateInfo.map(d => `
          <p style="font-size:0.85rem;color:var(--text-secondary);">
            <strong>${d.ticket_number}</strong> — ${Math.round(d.similarity_score * 100)}% match — ${d.reason}
          </p>
        `).join('')}
      </div>
    ` : ''}

    ${ticket.photo_path ? `
      <div class="detail-section">
        <div class="detail-section-title">📷 Attached Photo</div>
        <img src="${ticket.photo_path}" class="complaint-photo" alt="Complaint photo">
      </div>
    ` : ''}

    <div class="detail-section">
      <div class="detail-section-title">📜 History</div>
      <div class="timeline">${timelineHtml || '<p style="color:var(--text-muted);">No history</p>'}</div>
    </div>

    <!-- Staff Action Panel -->
    <div class="action-panel">
      <div class="action-panel-title">⚡ Staff Actions</div>
      <div class="action-grid">
        <div class="form-group">
          <label class="form-label">Update Status</label>
          <select class="form-select" id="modal-status">
            <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="assigned" ${ticket.status === 'assigned' ? 'selected' : ''}>Assigned</option>
            <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
            <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
            <option value="duplicate" ${ticket.status === 'duplicate' ? 'selected' : ''}>Duplicate</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Assign To</label>
          <input type="text" class="form-input" id="modal-assigned" value="${ticket.assigned_to || ''}" placeholder="e.g., John Rodriguez">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-4);">
        <label class="form-label">Staff Notes</label>
        <textarea class="form-textarea" id="modal-notes" placeholder="Add notes about inspection, work done, parts needed, etc." style="min-height:80px;">${ticket.staff_notes || ''}</textarea>
      </div>
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center;">
        <button class="btn btn-accent" onclick="updateTicket('${ticket.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
          Save Changes
        </button>
        <button class="btn btn-ghost" style="color:var(--danger-500);margin-left:auto;" onclick="deleteTicket('${ticket.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Delete Ticket
        </button>
      </div>
    </div>`;
}

async function updateTicket(ticketId) {
  const status = document.getElementById('modal-status').value;
  const assigned_to = document.getElementById('modal-assigned').value;
  const staff_notes = document.getElementById('modal-notes').value;

  try {
    const res = await fetch(`${API}/api/staff/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        assigned_to,
        staff_notes,
        staff_name: staffSession?.name || 'Staff'
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Ticket updated successfully!', 'success');
    closeModal();
    loadTickets();
    loadStats();
  } catch (err) {
    showToast(err.message || 'Failed to update ticket.', 'error');
  }
}

function closeModal() {
  document.getElementById('ticket-modal').classList.remove('active');
}

// Close modal with Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'));
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAction(action) {
  const labels = {
    created: '🎫 Ticket Created',
    status_changed: '🔄 Status Changed',
    assigned: '👤 Assigned',
    note_added: '📝 Note Added',
    duplicate_flagged: '⚠️ Duplicate Flagged'
  };
  return labels[action] || action.replace(/_/g, ' ');
}

// ══════════════════════════════════════════════════════════════════════════
// QUICK DEMO & TRIAGE HELPERS
// ══════════════════════════════════════════════════════════════════════════
function fillDemoComplaint(type) {
  const templates = {
    fan: {
      name: 'Alex Johnson',
      email: 'alex.j@campus.edu',
      phone: '9823456789',
      location: 'Science Complex, Block B, Room 302',
      building: 'Science Complex',
      floor: '3rd Floor',
      room: 'Room 302',
      text: 'The large ceiling fan in Room 302 is vibrating violently and making a loud screeching noise. Earlier today we saw visible electrical sparks from the motor housing. It feels very unsafe for lectures.'
    },
    water: {
      name: 'Ananya Sen',
      email: 'ananya.s@campus.edu',
      phone: '9876543210',
      location: 'Main Library, 2nd Floor, Economics Section',
      building: 'Main Library',
      floor: '2nd Floor',
      room: 'Stack 4B',
      text: 'Water is steadily dripping from the ceiling tiles directly over the economics book racks. There is a puddle on the carpet and reference books are at risk of water damage.'
    },
    ac: {
      name: 'David Chen',
      email: 'david.c@campus.edu',
      phone: '9123456780',
      location: 'Technology Center, 1st Floor, Computer Lab B',
      building: 'Technology Center',
      floor: '1st Floor',
      room: 'Computer Lab B',
      text: 'The central AC unit in Computer Lab B has stopped cooling and is blowing warm, humid air. The room temperature is over 32C and multiple server workstations have triggered thermal warnings.'
    },
    wifi: {
      name: 'Maya Lin',
      email: 'maya.l@campus.edu',
      phone: '',
      location: 'Dormitory Hall C, 3rd Floor East Wing',
      building: 'Hall C',
      floor: '3rd Floor',
      room: 'Corridor 3E',
      text: 'The WiFi router in Hall C 3rd floor disconnects every 5 minutes. Students submitting online course assignments keep losing their connection.'
    },
    lock: {
      name: 'Security Patrol',
      email: 'patrol@campus.edu',
      phone: '',
      location: 'Chemistry Annex, Room 102 Lab Door',
      building: 'Chemistry Annex',
      floor: 'Ground Floor',
      room: 'Lab 102',
      text: 'The electronic magnetic door lock on Chemistry Lab 102 has failed and the latch will not catch. The room contains sensitive laboratory equipment and remains unlocked.'
    }
  };

  const t = templates[type];
  if (!t) return;

  document.getElementById('student_name').value = t.name;
  document.getElementById('student_email').value = t.email;
  document.getElementById('student_phone').value = t.phone;
  document.getElementById('location').value = t.location;
  document.getElementById('building').value = t.building;
  document.getElementById('floor').value = t.floor;
  document.getElementById('room').value = t.room;
  document.getElementById('complaint_text').value = t.text;

  // Scroll to form submit
  document.getElementById('complaint_text').focus();
  showToast('Demo complaint filled! Click Submit to analyze with AI.', 'info');
}

// ==========================================
// EDITORIAL HERO PROMPT BAR & PRESETS
// ==========================================
let heroAttachedPhoto = null;
let heroSpeechRecognition = null;

function selectHeroPreset(type) {
  const input = document.getElementById('hero-prompt-input');
  if (!input) return;

  const presets = {
    leak: "Water is leaking steadily from the split AC unit in Computer Lab 3 onto the work benches and floor. Drip is getting worse and pooling near power outlets.",
    flicker: "The overhead fluorescent lights in Academic Block B 2nd floor corridor are flickering violently and buzzing loudly, creating visual strain and a safety hazard.",
    handle: "The main push-bar entry handle to the Physics Lecture Hall is broken and sticking, making it difficult for students to exit smoothly."
  };

  const text = presets[type] || '';
  input.value = text;
  input.focus();

  const card = document.querySelector('.hero-prompt-card');
  if (card) {
    card.classList.add('preset-selected-pulse');
    setTimeout(() => card.classList.remove('preset-selected-pulse'), 500);
  }

  const label = type === 'leak' ? 'AC Water Leakage - Lab 3' : type === 'flicker' ? 'Flickering Lights - Block B' : 'Broken Door Handle';
  showToast(`Preset "${label}" loaded! Click "Dispatch Gemini AI" to proceed.`, 'info');
}

function triggerHeroPhotoUpload() {
  const photoInput = document.getElementById('hero-photo-input');
  if (photoInput) photoInput.click();
}

function handleHeroPhotoSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  heroAttachedPhoto = file;
  const badge = document.getElementById('hero-photo-attached-badge');
  if (badge) {
    badge.style.display = 'inline-flex';
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      <span>${escapeHtml(file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name)}</span>
      <button type="button" class="photo-remove-btn" onclick="removeHeroPhoto(event)" title="Remove photo" aria-label="Remove photo">✕</button>
    `;
  }
  showToast(`Photo attached: ${file.name}`, 'success');
}

function removeHeroPhoto(e) {
  if (e) e.stopPropagation();
  heroAttachedPhoto = null;
  const photoInput = document.getElementById('hero-photo-input');
  if (photoInput) photoInput.value = '';
  const badge = document.getElementById('hero-photo-attached-badge');
  if (badge) badge.style.display = 'none';
}

function toggleHeroVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('hero-voice-btn');
  const input = document.getElementById('hero-prompt-input');

  if (!SpeechRecognition) {
    // Graceful fallback for browsers without Web Speech API
    showToast('Voice dictation simulation: Populating spoken voice transcript...', 'info');
    if (input) {
      input.value = "The ceiling fan in Room 204 is making an aggressive clicking sound and sparking occasionally near the regulator switch.";
      input.focus();
    }
    return;
  }

  if (heroSpeechRecognition) {
    heroSpeechRecognition.stop();
    heroSpeechRecognition = null;
    if (btn) btn.classList.remove('recording');
    return;
  }

  try {
    heroSpeechRecognition = new SpeechRecognition();
    heroSpeechRecognition.continuous = false;
    heroSpeechRecognition.interimResults = false;
    heroSpeechRecognition.lang = 'en-US';

    if (btn) btn.classList.add('recording');
    showToast('Listening... Speak your maintenance complaint now.', 'info');

    heroSpeechRecognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (input) {
        input.value = input.value ? input.value + ' ' + transcript : transcript;
        input.focus();
      }
      showToast('Voice transcribed successfully!', 'success');
    };

    heroSpeechRecognition.onerror = (err) => {
      console.warn('Speech recognition error:', err);
      showToast('Voice recording stopped. You can type or edit your text.', 'warning');
      if (btn) btn.classList.remove('recording');
      heroSpeechRecognition = null;
    };

    heroSpeechRecognition.onend = () => {
      if (btn) btn.classList.remove('recording');
      heroSpeechRecognition = null;
    };

    heroSpeechRecognition.start();
  } catch (err) {
    console.error('Speech recognition exception:', err);
    showToast('Voice input unavailable in this environment.', 'warning');
  }
}

function dispatchHeroComplaint() {
  const input = document.getElementById('hero-prompt-input');
  const text = input ? input.value.trim() : '';

  if (!text) {
    showToast('Please type a description of the issue or select a preset.', 'warning');
    if (input) input.focus();
    return;
  }

  // Navigate to Submit page
  navigateTo('submit');

  // Fill in the complaint text
  const targetTextarea = document.getElementById('complaint_text');
  if (targetTextarea) {
    targetTextarea.value = text;
    targetTextarea.focus();
  }

  // Pre-fill location if obvious campus references exist
  const locationInput = document.getElementById('location');
  const buildingInput = document.getElementById('building');
  const roomInput = document.getElementById('room');

  if (locationInput && !locationInput.value) {
    if (text.includes('Lab 3')) {
      locationInput.value = 'Computer Center, Lab 3';
      if (buildingInput) buildingInput.value = 'Computer Center';
      if (roomInput) roomInput.value = 'Lab 3';
    } else if (text.includes('Block B')) {
      locationInput.value = 'Academic Block B, 2nd Floor Corridor';
      if (buildingInput) buildingInput.value = 'Block B';
      if (roomInput) roomInput.value = '2nd Floor Corridor';
    } else if (text.includes('Physics Lecture Hall') || text.includes('Room 102')) {
      locationInput.value = 'Science Wing, Physics Lecture Hall Room 102';
      if (buildingInput) buildingInput.value = 'Science Wing';
      if (roomInput) roomInput.value = 'Physics Lecture Hall';
    }
  }

  // Transfer photo if attached in hero
  if (heroAttachedPhoto) {
    const photoFileInput = document.getElementById('photo');
    if (photoFileInput && window.DataTransfer) {
      try {
        const dt = new DataTransfer();
        dt.items.add(heroAttachedPhoto);
        photoFileInput.files = dt.files;

        const preview = document.getElementById('photo-preview');
        const reader = new FileReader();
        reader.onload = (e) => {
          if (preview) {
            preview.style.display = 'block';
            preview.innerHTML = `
              <img src="${e.target.result}" alt="Photo preview" style="max-height:160px;border-radius:var(--radius-lg);border:1px solid var(--border-default);">
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${escapeHtml(heroAttachedPhoto.name)}</div>
            `;
          }
        };
        reader.readAsDataURL(heroAttachedPhoto);
      } catch (e) {
        console.warn('Could not populate DataTransfer:', e);
      }
    }
  }

  showToast('Complaint loaded into Gemini AI Dispatch. Verify details and submit!', 'success');
}

function quickTrack(ticketNumber) {
  navigateTo('track');
  const input = document.getElementById('track-input');
  if (input) {
    input.value = ticketNumber;
    trackTicket();
  }
}

let activeTriageFilter = 'all';
function setTriageFilter(filter) {
  activeTriageFilter = filter;
  document.querySelectorAll('.triage-pill').forEach(p => p.classList.remove('active'));

  const clickedPill = (typeof event !== 'undefined' && event?.target?.closest('.triage-pill')) || 
                      document.querySelector(`.triage-pill[onclick*="'${filter}'"]`);
  if (clickedPill) clickedPill.classList.add('active');

  const statusSelect = document.getElementById('filter-status');
  const prioritySelect = document.getElementById('filter-priority');
  const searchInput = document.getElementById('ticket-search');

  if (filter === 'all') {
    if (statusSelect) statusSelect.value = 'all';
    if (prioritySelect) prioritySelect.value = '';
  } else if (filter === 'critical') {
    if (statusSelect) statusSelect.value = 'all';
    if (prioritySelect) prioritySelect.value = 'critical';
  } else if (filter === 'duplicates') {
    if (statusSelect) statusSelect.value = 'all';
    if (prioritySelect) prioritySelect.value = '';
    // Filter in table
    const dupTickets = allTickets.filter(t => t.duplicate_score >= 0.6 || t.status === 'duplicate');
    renderTicketTable(dupTickets);
    return;
  } else if (filter === 'in_progress') {
    if (statusSelect) statusSelect.value = 'in_progress';
    if (prioritySelect) prioritySelect.value = '';
  } else if (filter === 'resolved') {
    if (statusSelect) statusSelect.value = 'resolved';
    if (prioritySelect) prioritySelect.value = '';
  }

  loadTickets();
}

async function deleteTicket(ticketId) {
  if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
    return;
  }

  try {
    const res = await fetch(`${API}/api/staff/tickets/${ticketId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Ticket deleted successfully.', 'success');
    closeModal();
    loadTickets();
    loadStats();
  } catch (err) {
    showToast(err.message || 'Failed to delete ticket.', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AI SETTINGS MODAL
// ══════════════════════════════════════════════════════════════════════════
async function openAiSettingsModal() {
  document.getElementById('ai-settings-modal').classList.add('active');
  fetchAiStatus();
}

function closeAiSettingsModal() {
  document.getElementById('ai-settings-modal').classList.remove('active');
  document.getElementById('api-key-test-result').style.display = 'none';
}

function toggleKeyVisibility() {
  const input = document.getElementById('settings-api-key');
  if (input.type === 'password') {
    input.type = 'text';
  } else {
    input.type = 'password';
  }
}

async function fetchAiStatus() {
  try {
    const res = await fetch(`${API}/api/settings/ai-status`);
    const data = await res.json();

    const dot = document.getElementById('modal-ai-dot');
    const title = document.getElementById('modal-ai-title');
    const desc = document.getElementById('modal-ai-desc');
    const masked = document.getElementById('settings-masked-key');
    const navText = document.getElementById('ai-status-nav-text');
    const navDot = document.getElementById('ai-status-nav-dot');

    if (data.configured) {
      if (dot) dot.className = 'status-dot-large';
      if (navDot) navDot.className = 'ai-status-dot';
      if (title) title.textContent = 'Google Gemini 3.0 Flash Active';
      if (desc) desc.textContent = 'Multimodal analysis, intelligent routing & duplicate comparison enabled';
      if (masked) masked.textContent = data.maskedKey || 'Configured in Environment';
      if (navText) navText.textContent = 'Gemini 3.0 Flash Engine Active';
    } else {
      if (dot) dot.className = 'status-dot-large limited';
      if (navDot) navDot.className = 'ai-status-dot limited';
      if (title) title.textContent = 'Smart Facility Engine (Offline Mode)';
      if (desc) desc.textContent = 'Heuristic classification active — enter Google API key for Gemini 3.0 multimodal LLM';
      if (masked) masked.textContent = 'None configured';
      if (navText) navText.textContent = 'Gemini 3.0 Flash Engine Active';
    }
  } catch (err) {
    console.error('Failed to fetch AI status:', err);
  }
}

async function saveApiKey() {
  const input = document.getElementById('settings-api-key');
  const apiKey = input.value.trim();

  if (!apiKey || apiKey.length < 15) {
    showToast('Please enter a valid Gemini API Key.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/api/settings/ai-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Gemini API Key updated successfully!', 'success');
    input.value = '';
    fetchAiStatus();
  } catch (err) {
    showToast(err.message || 'Failed to save API key.', 'error');
  }
}

async function testApiKey() {
  const resultDiv = document.getElementById('api-key-test-result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;"><div class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> Testing Gemini connection...</div>';

  try {
    const res = await fetch(`${API}/api/settings/ai-status`);
    const data = await res.json();

    if (data.configured) {
      resultDiv.innerHTML = '<div style="color:var(--success-500);font-size:0.85rem;font-weight:600;">✅ Google Gemini 3.0 Flash is configured and operational.</div>';
    } else {
      resultDiv.innerHTML = '<div style="color:var(--warning-500);font-size:0.85rem;">⚠️ No Google API key found. System is currently running on smart rule-based AI engine.</div>';
    }
  } catch (err) {
    resultDiv.innerHTML = `<div style="color:var(--danger-500);font-size:0.85rem;">❌ Test failed: ${err.message}</div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// THEME (DARK / LIGHT MODE)
// ══════════════════════════════════════════════════════════════════════════
function initTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  updateThemeIcon(currentTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('campus_theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  if (sun && moon) {
    if (theme === 'dark') {
      sun.style.display = 'none';
      moon.style.display = 'inline-flex';
    } else {
      sun.style.display = 'inline-flex';
      moon.style.display = 'none';
    }
  }
}

// ── Startup initialization ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTheme();

  // Restore session if stored
  const savedUser = localStorage.getItem('campus_connect_user');
  const savedStaff = localStorage.getItem('campus_connect_staff');

  if (savedStaff && !savedUser) {
    try {
      staffSession = JSON.parse(savedStaff);
      currentUser = { ...staffSession, role: staffSession.role || 'staff' };
    } catch (e) {
      localStorage.removeItem('campus_connect_staff');
    }
  } else if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      if (currentUser.role === 'staff' || currentUser.role === 'admin' || currentUser.role === 'supervisor') {
        staffSession = currentUser;
      }
    } catch (e) {
      localStorage.removeItem('campus_connect_user');
    }
  }

  updateNavUserUI();

  if (currentUser) {
    if (currentUser.role === 'staff' || currentUser.role === 'admin' || currentUser.role === 'supervisor') {
      const loginDiv = document.getElementById('staff-login');
      const dashDiv = document.getElementById('staff-dashboard');
      const nameDisp = document.getElementById('staff-name-display');
      if (loginDiv) loginDiv.style.display = 'none';
      if (dashDiv) dashDiv.style.display = 'block';
      if (nameDisp) nameDisp.textContent = currentUser.name;
      navigateTo('dashboard');
    } else {
      // Student session
      const nameInput = document.getElementById('student_name');
      const emailInput = document.getElementById('student_email');
      const phoneInput = document.getElementById('student_phone');
      if (nameInput) nameInput.value = currentUser.name || '';
      if (emailInput) emailInput.value = currentUser.email || '';
      if (phoneInput && currentUser.phone) phoneInput.value = currentUser.phone;
      navigateTo('home');
    }
  } else {
    // Fresh visit: Open directly to Home page with the editorial hero and prompt bar
    navigateTo('home');
  }

  updateGlobalBackButton();
  fetchAiStatus();
});
