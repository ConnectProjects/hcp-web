/**
 * techtool/screens/training.js
 *
 * Training hub screen — accessible from Settings → Training.
 * Explains the practice mode and launches a practice visit session.
 */

import { createPracticePacket } from '../data/practice-packet.js'
import { getSetting }           from '../db/idb.js'

export async function renderTraining(container, state, navigate) {
  // Load tech name for personalised greeting
  const techName = state.user?.name ?? await getSetting('tech_name') ?? 'Technician'
  const firstName = techName.split(' ')[0]

  // Check if they've completed practice before
  const completedBefore = state.practiceCompleted ?? false

  container.innerHTML = `
    <div class="screen">
      <header class="app-header">
        <button class="btn btn-ghost" id="btn-back">‹ Settings</button>
        <h1 class="app-title">Training</h1>
      </header>

      <main class="screen-body" style="max-width:600px;padding:20px 16px">

        <div class="training-hero">
          <div class="training-hero-icon">🎓</div>
          <h2>TechTool Orientation</h2>
          <p>Welcome${completedBefore ? ' back' : ''}, ${esc(firstName)}. This practice session walks you through a complete audiometric testing visit using a fictional company and employees. No real data is saved.</p>
        </div>

        <div class="training-outcomes">
          <div class="training-outcome-title">During this session you will:</div>
          <div class="training-outcome-item">
            <span class="outcome-icon">✓</span>
            <span>Navigate the full visit workflow — from packet sync to submission</span>
          </div>
          <div class="training-outcome-item">
            <span class="outcome-icon">✓</span>
            <span>Enter audiometric thresholds and review the live audiogram</span>
          </div>
          <div class="training-outcome-item">
            <span class="outcome-icon">✓</span>
            <span>See four different classification outcomes: Normal, STS/Early Warning, Abnormal, and a Baseline (first) test</span>
          </div>
          <div class="training-outcome-item">
            <span class="outcome-icon">✓</span>
            <span>Review auto-generated counsel text and practice the referral workflow</span>
          </div>
          <div class="training-outcome-item">
            <span class="outcome-icon">✓</span>
            <span>Learn how TechTool determines classifications automatically using provincial rules — so you can focus on the worker, not the regulations</span>
          </div>
        </div>

        <div class="training-note">
          <strong>Note on classifications:</strong> TechTool is designed to determine hearing test classifications automatically based on the provincial regulations applicable to each company. The counselling text it generates is a starting point — you can and should edit it to reflect the specific situation. You don't need to memorise the rules; TechTool handles that so you can focus on the worker.
        </div>

        <div class="training-employees">
          <div class="training-emp-title">Practice employees (Alberta — AB):</div>
          <div class="training-emp-row">
            <span class="class-badge-practice class-n">N</span>
            <div>
              <div class="training-emp-name">SAMPLE, Normal</div>
              <div class="training-emp-desc">Baseline on file · Normal hearing · No action required</div>
            </div>
          </div>
          <div class="training-emp-row">
            <span class="class-badge-practice class-ew">EW</span>
            <div>
              <div class="training-emp-name">SAMPLE, Shift</div>
              <div class="training-emp-desc">Baseline on file · Standard Threshold Shift · Referral within 30 days</div>
            </div>
          </div>
          <div class="training-emp-row">
            <span class="class-badge-practice class-a">A</span>
            <div>
              <div class="training-emp-name">SAMPLE, Abnormal</div>
              <div class="training-emp-desc">Baseline on file · Abnormal finding · Medical referral required</div>
            </div>
          </div>
          <div class="training-emp-row">
            <span class="class-badge-practice" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db">BL</span>
            <div>
              <div class="training-emp-name">SAMPLE, Newstart</div>
              <div class="training-emp-desc">No baseline on file · First test — results become their baseline</div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-start-practice" style="width:100%;margin-top:20px;padding:14px;font-size:15px">
          ${completedBefore ? '↺ Redo Practice Visit' : '▶ Start Practice Visit'}
        </button>

        ${completedBefore ? `
          <div class="training-completed-badge">
            <span>✓</span> You've completed this orientation before. You can redo it any time.
          </div>
        ` : ''}

      </main>
    </div>
  `

  container.querySelector('#btn-back').addEventListener('click', () => navigate('settings'))

  container.querySelector('#btn-start-practice').addEventListener('click', () => {
    // Build the practice packet and inject it as the current packet
    const practicePacket = createPracticePacket()

    // Store existing real packets so we can restore them after practice
    state._realPackets    = state.packets
    state._realUser       = state.user
    state._inPracticeMode = true

    // Set up practice state
    state.currentPacket = practicePacket
    state.packets       = [practicePacket]
    state.practiceHintsSeen = {}

    navigate('company', { currentPacket: practicePacket })
  })
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
