const state = {
  bootstrap: null,
  teacherToken: sessionStorage.getItem("mossTeacherToken") || "",
  teacherData: null,
  teacherCourse: localStorage.getItem("mossTeacherCourse") || "จ32201",
  teacherPage: "dashboard",
  localScans: [],
  rosterAssignmentId: "",
  studentData: null,
  studentCourseIndex: 0
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  try {
    setLoading(true);
    state.bootstrap = await api("publicBootstrap");
    applySystemNames();
  } catch (error) {
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  $("#teacherLoginForm").addEventListener("submit", teacherLogin);
  $("#studentLoginForm").addEventListener("submit", studentLogin);
  $("#teacherLogout").addEventListener("click", logout);
  $("#studentLogout").addEventListener("click", logout);

  $("#teacherCourseSelect").addEventListener("change", async (event) => {
    state.teacherCourse = event.target.value;
    localStorage.setItem("mossTeacherCourse", state.teacherCourse);
    await loadTeacherData();
  });

  $("#teacherNav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (button) showTeacherPage(button.dataset.page);
  });

  $$("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showTeacherPage(button.dataset.go));
  });

  $$("[data-open-assignment]").forEach((button) => {
    button.addEventListener("click", () => openAssignmentDialog());
  });

  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#" + button.dataset.closeDialog).close();
    });
  });

  $("#assignmentForm").addEventListener("submit", saveAssignment);

  $("#scannerInput").addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await scanStudent(event.target.value);
    }
  });

  $("#clearLocalScans").addEventListener("click", () => {
    state.localScans = [];
    renderLocalScans();
  });

  $("#studentSearch").addEventListener("input", renderStudents);
  $("#studentClassFilter").addEventListener("change", renderStudents);
  $("#cardClassFilter").addEventListener("change", renderCards);
  $("#printCards").addEventListener("click", () => window.print());
  $("#reloadData").addEventListener("click", loadTeacherData);

  $("#studentCourseSelect").addEventListener("change", (event) => {
    state.studentCourseIndex = Number(event.target.value);
    renderStudentPortal();
  });

  $("#rosterSearch").addEventListener("input", renderRoster);

  const markAllButton = $("#markAllSubmitted");
  if (markAllButton) {
    markAllButton.addEventListener("click", markAllSubmitted);
  }

  const downloadCardButton = $("#downloadStudentCard");
  if (downloadCardButton) {
    downloadCardButton.addEventListener("click", downloadStudentCard);
  }

  ["#assignedDate", "#dueDate"].forEach((selector) => {
    const input = $(selector);
    if (input) input.addEventListener("input", formatDateInput);
  });
}

async function api(action, data = {}) {
  const response = await fetch("/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, data })
  });
  const payload = await response.json().catch(() => null);
  if (!payload || !payload.ok) {
    const error = new Error(payload?.error?.message || "เชื่อมต่อระบบไม่สำเร็จ");
    error.code = payload?.error?.code || "API_ERROR";
    throw error;
  }
  return payload.data;
}

async function teacherLogin(event) {
  event.preventDefault();
  try {
    setLoading(true);
    const result = await api("teacherLogin", { pin: $("#teacherPin").value });
    state.teacherToken = result.token;
    sessionStorage.setItem("mossTeacherToken", result.token);
    $("#teacherDisplayName").textContent = result.displayName || "เหล่าซือมอส";
    await openTeacher();
  } catch (error) {
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function studentLogin(event) {
  event.preventDefault();
  try {
    setLoading(true);
    state.studentData = await api("studentSummary", { studentId: cleanStudentId($("#studentIdLogin").value) });
    state.studentCourseIndex = 0;
    $("#entryView").classList.add("hidden");
    $("#teacherView").classList.add("hidden");
    $("#studentView").classList.remove("hidden");
    renderStudentPortal();
  } catch (error) {
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function openTeacher() {
  $("#entryView").classList.add("hidden");
  $("#studentView").classList.add("hidden");
  $("#teacherView").classList.remove("hidden");
  await loadTeacherData();
  showTeacherPage(state.teacherPage);
}

function logout() {
  state.teacherToken = "";
  state.teacherData = null;
  state.studentData = null;
  sessionStorage.removeItem("mossTeacherToken");
  $("#teacherPin").value = "";
  $("#studentIdLogin").value = "";
  $("#teacherView").classList.add("hidden");
  $("#studentView").classList.add("hidden");
  $("#entryView").classList.remove("hidden");
}

async function loadTeacherData() {
  try {
    setLoading(true);
    state.teacherData = await api("teacherBootstrap", {
      token: state.teacherToken,
      courseCode: state.teacherCourse
    });
    state.teacherCourse = state.teacherData.course.courseCode;
    localStorage.setItem("mossTeacherCourse", state.teacherCourse);
    populateTeacherCourses();
    renderTeacher();
  } catch (error) {
    if (["INVALID_SESSION", "SESSION_EXPIRED"].includes(error.code)) logout();
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
}

function populateTeacherCourses() {
  const courses = state.teacherData?.courses || state.bootstrap?.courses || [];
  $("#teacherCourseSelect").innerHTML = courses.map((course) =>
    `<option value="${escapeHtml(course.courseCode)}">${escapeHtml(course.courseCode)} ${escapeHtml(course.courseNameTH)}</option>`
  ).join("");
  $("#teacherCourseSelect").value = state.teacherCourse;
}

function applySystemNames() {
  const settings = state.bootstrap?.settings || {};
  $("#entryTitle").textContent = settings.SYSTEM_NAME_TH || "ระบบเช็กงานเหล่าซือมอส";
  $("#entryChinese").textContent = settings.SYSTEM_NAME_ZH || "陈老师作业管理系统";
  document.title = `${$("#entryTitle").textContent} | ${$("#entryChinese").textContent}`;
}

function renderTeacher() {
  renderDashboard();
  renderAssignments();
  renderStudentsFilters();
  renderStudents();
  renderScanner();
  renderCardsFilters();
  renderCards();
  renderSummary();
  if ($("#rosterDialog").open) renderRoster();
}

function showTeacherPage(page) {
  state.teacherPage = page;
  const meta = {
    dashboard: ["แดชบอร์ด", "ภาพรวมรายวิชาที่เลือก"],
    scanner: ["สแกนส่งงาน", "สแกน QR Code แล้วบันทึกเป็นส่งแล้ว"],
    assignments: ["จัดการงาน", "เพิ่ม แก้ไข ปิดงาน และตรวจรายชื่อ"],
    students: ["รายชื่อนักเรียน", "ข้อมูลอ่านจาก Google Sheet"],
    cards: ["บัตรนักเรียน", "พิมพ์บัตรพร้อม QR Code"],
    summary: ["สรุปงานค้าง", "ติดตามสถานะรายบุคคล"]
  };
  $$(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $$(".teacher-page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  $("#teacherPageTitle").textContent = meta[page][0];
  $("#teacherPageDesc").textContent = meta[page][1];
  if (page === "scanner") setTimeout(() => $("#scannerInput").focus(), 80);
  if (page === "cards") setTimeout(renderCards, 80);
}

function renderDashboard() {
  const data = state.teacherData;
  const course = data.course;
  const stats = getCourseStats();
  $("#courseBanner").innerHTML = `<h2>${escapeHtml(course.courseCode)} ${escapeHtml(course.courseNameTH)} · ${escapeHtml(course.courseNameZH)}</h2><p>ระดับชั้น ${course.classes.map(escapeHtml).join(", ")}</p>`;
  $("#statsGrid").innerHTML = [
    statCard("งานทั้งหมด", data.assignments.length, "รายการที่ใช้งาน"),
    statCard("นักเรียนทั้งหมด", data.students.length, "ตามห้องที่กำหนด"),
    statCard("ส่งแล้ว", stats.submitted, "รายการส่งงาน"),
    statCard("ค้าง / ไม่ส่ง", stats.pending + stats.missing, "รายการที่ติดตาม")
  ].join("");
  const latest = data.assignments[0];
  if (!latest) {
    $("#latestAssignment").innerHTML = `<div class="empty">ยังไม่มีงานในรายวิชานี้</div>`;
    return;
  }
  const done = data.students.filter((student) => getStatus(latest.assignmentId, student.studentId) === "submitted").length;
  const percent = data.students.length ? Math.round(done * 100 / data.students.length) : 0;
  $("#latestAssignment").innerHTML = `<h3>${escapeHtml(latest.title)}</h3><p>วันที่สั่ง ${formatDate(latest.assignedDate)} · กำหนดส่ง ${formatDate(latest.dueDate)}</p><div class="progress"><div style="width:${percent}%"></div></div><p><b>${done}/${data.students.length} คน (${percent}%)</b></p>`;
}

function renderScanner() {
  const assignments = state.teacherData.assignments;
  const current = $("#scanAssignmentSelect").value;
  $("#scanAssignmentSelect").innerHTML = assignments.length
    ? assignments.map((a) => `<option value="${escapeHtml(a.assignmentId)}">${escapeHtml(a.title)} · ${formatDate(a.dueDate)}</option>`).join("")
    : `<option value="">ยังไม่มีงาน กรุณาเพิ่มงานก่อน</option>`;
  if (assignments.some((a) => a.assignmentId === current)) $("#scanAssignmentSelect").value = current;
  renderLocalScans();
}

async function scanStudent(rawValue) {
  const studentId = cleanStudentId(rawValue);
  const assignmentId = $("#scanAssignmentSelect").value;
  const input = $("#scannerInput");

  if (!assignmentId) {
    showScanMessage(
      "กรุณาเพิ่มหรือเลือกงานก่อนเริ่มสแกน",
      true
    );
    return;
  }

  if (!studentId) {
    return;
  }

  // ป้องกันการสแกนซ้ำขณะกำลังบันทึก
  if (input.dataset.busy === "1") {
    return;
  }

  input.dataset.busy = "1";

  // ล้างช่องทันทีเพื่อเตรียมสแกนคนต่อไป
  input.value = "";

  showScanMessage(
    `กำลังบันทึกเลขประจำตัว ${studentId}...`,
    false
  );

  try {
    const result = await api("scanSubmission", {
      token: state.teacherToken,
      assignmentId,
      studentId
    });

    // อัปเดตข้อมูลในหน้าเว็บทันที
    // ไม่ต้องโหลดข้อมูลทั้งวิชาใหม่
    const recordKey =
      `${result.assignment.assignmentId}|${result.student.studentId}`;

    state.teacherData.records[recordKey] = {
      status: "submitted",
      submittedAt:
        result.record?.submittedAt ||
        new Date().toISOString(),
      updatedAt:
        result.record?.updatedAt ||
        new Date().toISOString(),
      note: ""
    };

    // เพิ่มประวัติการสแกน
    state.localScans.unshift({
      name: result.student.fullName,
      studentId: result.student.studentId,
      assignment: result.assignment.title,
      time: new Date().toLocaleTimeString(
        "th-TH",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      )
    });

    state.localScans = state.localScans.slice(0, 30);

    showScanMessage(
      `✓ บันทึก ${result.student.fullName} ส่งงานแล้ว`,
      false
    );

    // อัปเดตเฉพาะส่วนที่จำเป็น
    renderLocalScans();
    renderDashboard();
    renderAssignments();
    renderStudents();
    renderSummary();

    if (
      $("#rosterDialog").open &&
      state.rosterAssignmentId ===
        result.assignment.assignmentId
    ) {
      renderRoster();
    }

  } catch (error) {
    showScanMessage(
      error.message || "บันทึกข้อมูลไม่สำเร็จ",
      true
    );

  } finally {
    input.dataset.busy = "0";

    setTimeout(() => {
      input.focus();
    }, 30);
  }
}
function showScanMessage(text, isError) {
  const message = $("#scanMessage");
  message.textContent = text;
  message.className = `scan-message ${isError ? "error" : "success"}`;
}

function renderLocalScans() {
  $("#localScanHistory").innerHTML = state.localScans.length
    ? state.localScans.map((item) => `<div class="history-item"><div><b>✓ ${escapeHtml(item.name)}</b><small>${escapeHtml(item.assignment)} · ${escapeHtml(item.studentId)}</small></div><small>${escapeHtml(item.time)}</small></div>`).join("")
    : `<div class="empty">ยังไม่มีรายการสแกนในรอบนี้</div>`;
}

function renderAssignments() {
  const data = state.teacherData;
  $("#assignmentGrid").innerHTML = data.assignments.length
    ? data.assignments.map((assignment) => {
        const done = data.students.filter((student) => getStatus(assignment.assignmentId, student.studentId) === "submitted").length;
        const percent = data.students.length ? Math.round(done * 100 / data.students.length) : 0;
        return `<article class="assignment-card"><span class="badge course">${escapeHtml(assignment.courseCode)}</span><h3>${escapeHtml(assignment.title)}</h3><p>วันที่สั่ง ${formatDate(assignment.assignedDate)}<br>กำหนดส่ง ${formatDate(assignment.dueDate)}${assignment.note ? `<br>${escapeHtml(assignment.note)}` : ""}</p><div class="progress"><div style="width:${percent}%"></div></div><p>ส่งแล้ว ${done}/${data.students.length} คน (${percent}%)</p><div class="assignment-actions"><button class="btn ghost small" onclick="openRoster('${jsString(assignment.assignmentId)}')">ดูรายชื่อ</button><button class="btn ghost small" onclick="openAssignmentDialog('${jsString(assignment.assignmentId)}')">แก้ไข</button><button class="btn ghost small" onclick="archiveAssignment('${jsString(assignment.assignmentId)}')">ปิดงาน</button></div></article>`;
      }).join("")
    : `<div class="panel empty">ยังไม่มีงานในรายวิชานี้</div>`;
}

function openAssignmentDialog(assignmentId = "") {
  const assignment = state.teacherData?.assignments.find(
    (item) => item.assignmentId === assignmentId
  );

  $("#editAssignmentId").value = assignmentId;
  $("#assignmentDialogTitle").textContent =
    assignment ? "แก้ไขงาน" : "เพิ่มงานใหม่";
  $("#assignmentTitle").value = assignment?.title || "";
  $("#assignmentNote").value = assignment?.note || "";

  const today = new Date().toISOString().slice(0, 10);

  $("#assignedDate").value = isoToDisplayDate(
    assignment?.assignedDate || today
  );

  $("#dueDate").value = isoToDisplayDate(
    assignment?.dueDate || today
  );

  $("#assignmentDialog").showModal();
}

async function saveAssignment(event) {
  event.preventDefault();

  const assignmentId = $("#editAssignmentId").value;
  const assignedDate = displayDateToIso($("#assignedDate").value);
  const dueDate = displayDateToIso($("#dueDate").value);

  if (!assignedDate || !dueDate) {
    toast(
      "กรุณากรอกวันที่เป็น วัน/เดือน/ปี เช่น 01/08/2569",
      true
    );
    return;
  }

  try {
    setLoading(true);

    await api(
      assignmentId ? "updateAssignment" : "addAssignment",
      {
        token: state.teacherToken,
        assignmentId,
        courseCode: state.teacherCourse,
        title: $("#assignmentTitle").value.trim(),
        assignedDate,
        dueDate,
        note: $("#assignmentNote").value.trim()
      }
    );

    $("#assignmentDialog").close();
    toast(
      assignmentId
        ? "แก้ไขงานเรียบร้อย"
        : "เพิ่มงานเรียบร้อย"
    );

    await loadTeacherData();
  } catch (error) {
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function archiveAssignment(assignmentId) {
  if (!confirm("ต้องการปิดงานนี้หรือไม่? ข้อมูลการส่งเดิมจะยังอยู่ในชีต")) return;
  try {
    setLoading(true);
    await api("archiveAssignment", { token: state.teacherToken, assignmentId });
    toast("ปิดงานเรียบร้อย");
    await loadTeacherData();
  } catch (error) {
    toast(error.message, true);
  } finally {
    setLoading(false);
  }
}

function renderStudentsFilters() {
  const classes = ["ทั้งหมด", ...new Set(state.teacherData.students.map((s) => s.className))];
  const old = $("#studentClassFilter").value || "ทั้งหมด";
  $("#studentClassFilter").innerHTML = classes.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
  $("#studentClassFilter").value = classes.includes(old) ? old : "ทั้งหมด";
}

function renderStudents() {
  if (!state.teacherData) return;
  const query = $("#studentSearch").value.trim().toLowerCase();
  const className = $("#studentClassFilter").value || "ทั้งหมด";
  const assignments = state.teacherData.assignments;
  const list = state.teacherData.students.filter((student) => (className === "ทั้งหมด" || student.className === className) && (`${student.studentId} ${student.fullName}`.toLowerCase().includes(query)));
  $("#studentTableBody").innerHTML = list.length ? list.map((student) => {
    const submitted = assignments.filter((a) => getStatus(a.assignmentId, student.studentId) === "submitted").length;
    return `<tr><td>${student.number}</td><td>${escapeHtml(student.studentId)}</td><td><b>${escapeHtml(student.fullName)}</b></td><td>${escapeHtml(student.className)}</td><td>${submitted}</td><td>${assignments.length - submitted}</td></tr>`;
  }).join("") : `<tr><td colspan="6" class="empty">ไม่พบรายชื่อ</td></tr>`;
}

function renderCardsFilters() {
  const classes = ["ทั้งหมด", ...new Set(state.teacherData.students.map((s) => s.className))];
  const old = $("#cardClassFilter").value || "ทั้งหมด";
  $("#cardClassFilter").innerHTML = classes.map((value) => `<option>${escapeHtml(value)}</option>`).join("");
  $("#cardClassFilter").value = classes.includes(old) ? old : "ทั้งหมด";
}

function renderCards() {
  if (!state.teacherData || typeof QRCode === "undefined") return;
  const className = $("#cardClassFilter").value || "ทั้งหมด";
  const students = state.teacherData.students.filter((s) => className === "ทั้งหมด" || s.className === className);
  $("#idCardGrid").innerHTML = students.map((student, index) => `<article class="id-card"><div class="id-head"><div class="mini-seal">陈</div><div><b>ระบบเช็กงานเหล่าซือมอส</b><small>陈老师作业管理系统</small></div></div><div class="id-body"><div class="id-info"><h3>${escapeHtml(student.fullName)}</h3><p><b>เลขประจำตัว:</b> ${escapeHtml(student.studentId)}</p><p><b>ชั้น/ห้อง:</b> ${escapeHtml(student.className)}</p><p><b>เลขที่:</b> ${student.number}</p></div><div class="qr-box" id="qr-${index}"></div></div></article>`).join("");
  students.forEach((student, index) => new QRCode(document.getElementById(`qr-${index}`), { text: student.studentId, width: 80, height: 80, correctLevel: QRCode.CorrectLevel.M }));
}

function renderSummary() {
  const data = state.teacherData;
  const rows = data.students.map((student) => {
    const statuses = data.assignments.map((a) => getStatus(a.assignmentId, student.studentId));
    const submitted = statuses.filter((s) => s === "submitted").length;
    const pending = statuses.filter((s) => s === "pending").length;
    const missing = statuses.filter((s) => s === "missing").length;
    const percent = statuses.length ? Math.round(submitted * 100 / statuses.length) : 100;
    return { student, submitted, pending, missing, percent, total: statuses.length };
  });
  $("#summaryStats").innerHTML = [
    statCard("ส่งครบทุกงาน", rows.filter((r) => r.total > 0 && r.submitted === r.total).length, "คน"),
    statCard("มีงานค้าง", rows.filter((r) => r.pending > 0).length, "คน"),
    statCard("มีสถานะไม่ส่ง", rows.filter((r) => r.missing > 0).length, "คน"),
    statCard("นักเรียนทั้งหมด", rows.length, "คน")
  ].join("");
  $("#summaryTableBody").innerHTML = rows.length ? rows.map((row) => `<tr><td>${row.student.number}</td><td><b>${escapeHtml(row.student.fullName)}</b><br><small>${escapeHtml(row.student.studentId)}</small></td><td>${escapeHtml(row.student.className)}</td><td>${row.total}</td><td>${row.submitted}</td><td>${row.pending}</td><td>${row.missing}</td><td style="min-width:150px"><div class="progress"><div style="width:${row.percent}%"></div></div><small>${row.percent}%</small></td></tr>`).join("") : `<tr><td colspan="8" class="empty">ยังไม่มีนักเรียน</td></tr>`;
}

// ==========================================
// หน้าต่างตรวจรายชื่อนักเรียนแบบ Premium
// ==========================================

function getRosterStatusMeta(status) {
  const statusMap = {
    submitted: {
      label: "ส่งแล้ว",
      icon: "✓",
      rowClass: "submitted",
      badgeClass: "submitted",
      selectClass: "submitted"
    },

    pending: {
      label: "งานค้าง",
      icon: "⏳",
      rowClass: "pending",
      badgeClass: "pending",
      selectClass: "pending"
    },

    missing: {
      label: "ไม่ส่ง",
      icon: "!",
      rowClass: "missing",
      badgeClass: "missing",
      selectClass: "missing"
    }
  };

  return statusMap[status] || statusMap.pending;
}


// เปิดหน้าต่างรายชื่อนักเรียน
function openRoster(assignmentId) {
  state.rosterAssignmentId = assignmentId;

  // ล้างคำค้นหาเดิม
  $("#rosterSearch").value = "";

  // สร้างข้อมูลในหน้าต่าง
  renderRoster();

  // เปิดหน้าต่าง
  $("#rosterDialog").showModal();

  // โฟกัสช่องค้นหา
  setTimeout(() => {
    $("#rosterSearch").focus();
  }, 100);
}


// แสดงรายชื่อนักเรียนและสถานะ
function renderRoster() {
  if (
    !state.teacherData ||
    !state.rosterAssignmentId
  ) {
    return;
  }

  const assignment =
    state.teacherData.assignments.find(
      (item) =>
        item.assignmentId ===
        state.rosterAssignmentId
    );

  if (!assignment) {
    $("#rosterTitle").textContent =
      "ไม่พบข้อมูลงาน";

    $("#rosterMeta").textContent = "";

    $("#rosterBody").innerHTML = `
      <tr>
        <td
          colspan="4"
          class="roster-empty"
        >
          ไม่พบงานที่เลือก
        </td>
      </tr>
    `;

    return;
  }


  // คำนวณจำนวนสถานะแต่ละแบบ
  const allStudents =
    state.teacherData.students || [];

  let submittedCount = 0;
  let pendingCount = 0;
  let missingCount = 0;

  allStudents.forEach((student) => {
    const status = getStatus(
      assignment.assignmentId,
      student.studentId
    );

    if (status === "submitted") {
      submittedCount++;
    } else if (status === "missing") {
      missingCount++;
    } else {
      pendingCount++;
    }
  });


  // ตั้งชื่อและรายละเอียดด้านบน
  $("#rosterTitle").textContent =
    assignment.title;

  $("#rosterMeta").textContent =
    `กำหนดส่ง ${formatDate(assignment.dueDate)} · ` +
    `ส่งแล้ว ${submittedCount} คน · ` +
    `งานค้าง ${pendingCount} คน · ` +
    `ไม่ส่ง ${missingCount} คน`;

  const remainingCount = pendingCount + missingCount;
  const markAllButton = $("#markAllSubmitted");

  if (markAllButton) {
    markAllButton.disabled = remainingCount === 0;
    markAllButton.textContent =
      remainingCount === 0
        ? "✓ ส่งครบแล้ว"
        : `✓ ส่งทั้งหมด (${remainingCount} คน)`;
  }


  // ค้นหานักเรียน
  const keyword = String(
    $("#rosterSearch").value || ""
  )
    .trim()
    .toLowerCase();


  const students = [...allStudents]
    .filter((student) => {
      const searchableText = [
        student.studentId,
        student.fullName,
        student.className,
        student.number
      ]
        .join(" ")
        .toLowerCase();

      return (
        !keyword ||
        searchableText.includes(keyword)
      );
    })

    // เรียงตามเลขที่
    .sort((a, b) => {
      return (
        Number(a.number || 999) -
        Number(b.number || 999)
      );
    });


  // ไม่พบรายชื่อ
  if (!students.length) {
    $("#rosterBody").innerHTML = `
      <tr>
        <td
          colspan="4"
          class="roster-empty"
        >
          ไม่พบนักเรียนตามคำค้นหา
        </td>
      </tr>
    `;

    return;
  }


  // สร้างตารางรายชื่อ
  $("#rosterBody").innerHTML =
    students
      .map((student) => {
        const status = getStatus(
          assignment.assignmentId,
          student.studentId
        );

        const meta =
          getRosterStatusMeta(status);

        return `
          <tr
            class="roster-row ${meta.rowClass}"
            data-student-id="${escapeHtml(
              student.studentId
            )}"
          >

            <td>
              <b>${student.number || "-"}</b>
            </td>


            <td>
              ${escapeHtml(
                student.studentId || "-"
              )}
            </td>


            <td>
              <div class="roster-student-name">
                ${escapeHtml(
                  student.fullName || "-"
                )}
              </div>

              <div class="roster-student-sub">
                ${escapeHtml(
                  student.className || ""
                )}
              </div>
            </td>


            <td>
              <div class="roster-status-cell">

                <span
                  class="roster-status-badge ${meta.badgeClass}"
                >
                  ${meta.icon} ${meta.label}
                </span>


                <select
                  class="roster-status-select ${meta.selectClass}"
                  onchange="
                    changeStatus(
                      '${jsString(student.studentId)}',
                      this.value,
                      this
                    )
                  "
                >

                  <option
                    value="submitted"
                    ${
                      status === "submitted"
                        ? "selected"
                        : ""
                    }
                  >
                    ส่งแล้ว
                  </option>


                  <option
                    value="pending"
                    ${
                      status === "pending"
                        ? "selected"
                        : ""
                    }
                  >
                    งานค้าง
                  </option>


                  <option
                    value="missing"
                    ${
                      status === "missing"
                        ? "selected"
                        : ""
                    }
                  >
                    ไม่ส่ง
                  </option>

                </select>

              </div>
            </td>

          </tr>
        `;
      })
      .join("");
}


// เปลี่ยนสถานะนักเรียน
async function changeStatus(
  studentId,
  status,
  selectElement = null
) {
  const assignmentId =
    state.rosterAssignmentId;

  if (!assignmentId || !studentId) {
    toast(
      "ไม่พบข้อมูลงานหรือนักเรียน",
      true
    );
    return;
  }


  const oldStatus = getStatus(
    assignmentId,
    studentId
  );


  // ปิดช่องชั่วคราวระหว่างบันทึก
  if (selectElement) {
    selectElement.disabled = true;
    selectElement.style.opacity = "0.6";
  }


  try {
    const result = await api(
      "setSubmissionStatus",
      {
        token: state.teacherToken,
        assignmentId,
        studentId,
        status
      }
    );


    const recordKey =
      `${assignmentId}|${studentId}`;

    const oldRecord =
      state.teacherData.records[recordKey] ||
      {};


    // อัปเดตข้อมูลในหน้าเว็บทันที
    state.teacherData.records[recordKey] = {
      ...oldRecord,
      ...result,
      status,
      updatedAt:
        result?.updatedAt ||
        new Date().toISOString()
    };


    // อัปเดตเฉพาะส่วนที่เกี่ยวข้อง
    renderRoster();
    renderDashboard();
    renderAssignments();
    renderStudents();
    renderSummary();


    const statusMeta =
      getRosterStatusMeta(status);

    toast(
      `เปลี่ยนสถานะเป็น “${statusMeta.label}” แล้ว`
    );

  } catch (error) {

    // คืนค่าเดิมหากบันทึกไม่สำเร็จ
    if (selectElement) {
      selectElement.value = oldStatus;
      selectElement.disabled = false;
      selectElement.style.opacity = "1";
    }

    toast(
      error.message ||
      "บันทึกสถานะไม่สำเร็จ",
      true
    );
  }
}

// บันทึกนักเรียนทุกคนเป็นส่งแล้วในครั้งเดียว
async function markAllSubmitted() {
  const assignmentId = state.rosterAssignmentId;

  const assignment = state.teacherData?.assignments.find(
    (item) => item.assignmentId === assignmentId
  );

  if (!assignment) {
    toast("ไม่พบงานที่เลือก", true);
    return;
  }

  const remainingStudents = state.teacherData.students.filter(
    (student) =>
      getStatus(assignmentId, student.studentId) !== "submitted"
  );

  if (!remainingStudents.length) {
    toast("นักเรียนส่งงานครบแล้ว");
    return;
  }

  const confirmed = confirm(
    `ต้องการเปลี่ยนนักเรียนที่ยังไม่ส่งจำนวน ` +
    `${remainingStudents.length} คน เป็น “ส่งแล้ว” หรือไม่?\n\n` +
    `งาน: ${assignment.title}`
  );

  if (!confirmed) return;

  const button = $("#markAllSubmitted");
  const oldText = button?.textContent || "✓ ส่งทั้งหมด";

  if (button) {
    button.disabled = true;
    button.textContent = "กำลังบันทึก...";
  }

  try {
    const result = await api("bulkSetSubmissionStatus", {
      token: state.teacherToken,
      assignmentId,
      status: "submitted"
    });

    const now = new Date().toISOString();

    state.teacherData.students.forEach((student) => {
      const recordKey = `${assignmentId}|${student.studentId}`;
      const oldRecord = state.teacherData.records[recordKey] || {};

      state.teacherData.records[recordKey] = {
        ...oldRecord,
        status: "submitted",
        submittedAt: oldRecord.submittedAt || now,
        updatedAt: now
      };
    });

    renderRoster();
    renderDashboard();
    renderAssignments();
    renderStudents();
    renderSummary();

    toast(
      `บันทึกส่งทั้งหมด ${result?.total || state.teacherData.students.length} คนแล้ว`
    );
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = oldText;
    }

    toast(
      error.message || "บันทึกส่งทั้งหมดไม่สำเร็จ",
      true
    );
  }
}

// แสดงบัตรประจำตัวนักเรียนส่วนตัวและสร้าง QR Code
function renderStudentPersonalCard(student) {
  const section = $("#studentIdCardSection");
  const qrBox = $("#studentPersonalQr");

  if (!section || !qrBox || !student) return;

  $("#studentCardName").textContent = student.fullName || "-";
  $("#studentCardId").textContent = student.studentId || "-";
  $("#studentCardClass").textContent = student.className || "-";
  $("#studentCardNumber").textContent = student.number || "-";

  qrBox.innerHTML = "";

  if (typeof QRCode === "undefined") {
    qrBox.textContent = "โหลด QR ไม่สำเร็จ";
    section.classList.remove("hidden");
    return;
  }

  new QRCode(qrBox, {
    text: String(student.studentId || ""),
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.H
  });

  section.classList.remove("hidden");
}


// ดาวน์โหลดบัตรนักเรียนเป็นไฟล์ PNG
async function downloadStudentCard() {
  const student = state.studentData?.student;

  if (!student) {
    toast("ไม่พบข้อมูลนักเรียน", true);
    return;
  }

  const qrSource =
    $("#studentPersonalQr canvas") ||
    $("#studentPersonalQr img");

  if (!qrSource) {
    toast("QR Code ยังโหลดไม่เสร็จ กรุณาลองอีกครั้ง", true);
    return;
  }

  const button = $("#downloadStudentCard");
  const oldText = button?.textContent || "⬇️ ดาวน์โหลดบัตรนักเรียน";

  if (button) {
    button.disabled = true;
    button.textContent = "กำลังสร้างบัตร...";
  }

  try {
    const width = 1011;
    const height = 638;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการสร้างรูปบัตร");

    // พื้นหลังและกรอบบัตร
    ctx.save();
    roundedRectPath(ctx, 6, 6, width - 12, height - 12, 38);
    ctx.clip();

    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#fffefa");
    background.addColorStop(1, "#fff2df");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(
      width * 0.9,
      height * 0.12,
      10,
      width * 0.9,
      height * 0.12,
      300
    );
    glow.addColorStop(0, "rgba(232,180,79,0.24)");
    glow.addColorStop(1, "rgba(232,180,79,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(200,63,72,0.055)";
    ctx.font = "260px serif";
    ctx.fillText("中", 760, 650);

    ctx.restore();

    ctx.strokeStyle = "#8e2632";
    ctx.lineWidth = 8;
    roundedRectPath(ctx, 6, 6, width - 12, height - 12, 38);
    ctx.stroke();

    // ตราประทับ
    ctx.fillStyle = "#8e2632";
    roundedRectPath(ctx, 52, 42, 118, 118, 32);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = '900 66px "Noto Sans Thai", "Arial", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("陈", 111, 104);

    // ชื่อระบบ
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#8e2632";
    ctx.font = '800 38px "Noto Sans Thai", "Tahoma", sans-serif';
    ctx.fillText("ระบบเช็กงานเหล่าซือมอส", 195, 90);

    ctx.fillStyle = "#89787c";
    ctx.font = '24px "Noto Sans SC", "Arial", sans-serif';
    ctx.fillText("陈老师作业管理系统", 195, 132);

    // เส้นแบ่ง
    ctx.strokeStyle = "#ead5c7";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(52, 190);
    ctx.lineTo(959, 190);
    ctx.stroke();

    // ชื่อนักเรียน
    ctx.fillStyle = "#2f2a2d";
    drawFittedText(
      ctx,
      String(student.fullName || "-"),
      64,
      285,
      575,
      43,
      30,
      '800 {size}px "Noto Sans Thai", "Tahoma", sans-serif'
    );

    // ข้อมูลนักเรียน
    ctx.fillStyle = "#55494d";
    ctx.font = '600 27px "Noto Sans Thai", "Tahoma", sans-serif';
    ctx.fillText(`เลขประจำตัว: ${student.studentId || "-"}`, 64, 365);
    ctx.fillText(`ชั้น/ห้อง: ${student.className || "-"}`, 64, 425);
    ctx.fillText(`เลขที่: ${student.number || "-"}`, 64, 485);

    ctx.fillStyle = "#8e2632";
    ctx.font = '700 22px "Noto Sans Thai", "Tahoma", sans-serif';
    ctx.fillText("ใช้ QR Code นี้สำหรับเช็กส่งงาน", 64, 555);

    // กล่อง QR
    ctx.fillStyle = "#ffffff";
    roundedRectPath(ctx, 690, 230, 270, 270, 22);
    ctx.fill();

    ctx.strokeStyle = "rgba(142,38,50,0.10)";
    ctx.lineWidth = 2;
    roundedRectPath(ctx, 690, 230, 270, 270, 22);
    ctx.stroke();

    if (qrSource instanceof HTMLImageElement && !qrSource.complete) {
      await new Promise((resolve, reject) => {
        qrSource.onload = resolve;
        qrSource.onerror = reject;
      });
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrSource, 710, 250, 230, 230);

    // ดาวน์โหลดไฟล์
    const safeName = String(student.fullName || student.studentId || "student")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim();

    const link = document.createElement("a");
    link.download = `บัตรส่งงาน_${safeName}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();

    toast("ดาวน์โหลดบัตรนักเรียนเรียบร้อย");
  } catch (error) {
    toast(
      error.message || "สร้างไฟล์บัตรไม่สำเร็จ",
      true
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText;
    }
  }
}


function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}


function drawFittedText(
  ctx,
  text,
  x,
  y,
  maxWidth,
  startSize,
  minSize,
  fontTemplate
) {
  let size = startSize;

  while (size > minSize) {
    ctx.font = fontTemplate.replace("{size}", size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }

  ctx.fillText(text, x, y);
}


// แปลง YYYY-MM-DD เป็น DD/MM/YYYY
function isoToDisplayDate(value) {
  const match = String(value || "").match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return "";

  return `${match[3]}/${match[2]}/${match[1]}`;
}


// แปลง DD/MM/YYYY เป็น YYYY-MM-DD
function displayDateToIso(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (year > 2400) {
    year -= 543;
  }

  const checkedDate = new Date(year, month - 1, day);

  if (
    checkedDate.getFullYear() !== year ||
    checkedDate.getMonth() !== month - 1 ||
    checkedDate.getDate() !== day
  ) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


// เติมเครื่องหมาย / ขณะพิมพ์วันที่
function formatDateInput(event) {
  const digits = event.target.value
    .replace(/\D/g, "")
    .slice(0, 8);

  let formatted = digits.slice(0, 2);

  if (digits.length > 2) {
    formatted += "/" + digits.slice(2, 4);
  }

  if (digits.length > 4) {
    formatted += "/" + digits.slice(4, 8);
  }

  event.target.value = formatted;
}

function renderStudentPortal() {
  const data = state.studentData;
  if (!data) return;

  $("#studentName").textContent = data.student.fullName;
  $("#studentMeta").textContent =
    `${data.student.className} · เลขที่ ${data.student.number} · ${data.student.studentId}`;

  renderStudentPersonalCard(data.student);

  $("#studentCourseSelect").innerHTML = data.courseWorks
    .map(
      (work, index) =>
        `<option value="${index}">` +
        `${escapeHtml(work.course.courseCode)} ` +
        `${escapeHtml(work.course.courseNameTH)}` +
        `</option>`
    )
    .join("");

  $("#studentCourseSelect").value = String(state.studentCourseIndex);

  const work = data.courseWorks[state.studentCourseIndex];

  if (!work) {
    $("#studentStats").innerHTML = "";
    $("#studentWorkBody").innerHTML =
      `<tr><td colspan="4" class="empty">` +
      `ไม่พบรายวิชาของนักเรียน` +
      `</td></tr>`;
    return;
  }

  const submitted = work.assignments.filter(
    (assignment) => assignment.status === "submitted"
  ).length;

  const missing = work.assignments.filter(
    (assignment) => assignment.status === "missing"
  ).length;

  const pending =
    work.assignments.length - submitted - missing;

  $("#studentStats").innerHTML = [
    statCard(
      "งานทั้งหมด",
      work.assignments.length,
      work.course.courseCode
    ),
    statCard("ส่งแล้ว", submitted, "งาน"),
    statCard("งานค้าง", pending, "งาน"),
    statCard("ไม่ส่ง", missing, "งาน")
  ].join("");

  $("#studentWorkBody").innerHTML =
    work.assignments.length
      ? work.assignments
          .map(
            (assignment) =>
              `<tr>` +
              `<td><b>${escapeHtml(assignment.title)}</b>` +
              `${
                assignment.note
                  ? `<br><small>${escapeHtml(assignment.note)}</small>`
                  : ""
              }</td>` +
              `<td>${formatDate(assignment.assignedDate)}</td>` +
              `<td>${formatDate(assignment.dueDate)}</td>` +
              `<td>${statusBadge(assignment.status)}</td>` +
              `</tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="empty">` +
        `ยังไม่มีงานในรายวิชานี้` +
        `</td></tr>`;
}

function getCourseStats() {
  const stats = { submitted: 0, pending: 0, missing: 0 };
  state.teacherData.assignments.forEach((assignment) => state.teacherData.students.forEach((student) => stats[getStatus(assignment.assignmentId, student.studentId)]++));
  return stats;
}
function getStatus(assignmentId, studentId) { return state.teacherData.records[`${assignmentId}|${studentId}`]?.status || "pending"; }
function statCard(label, value, note) { return `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></article>`; }
function statusBadge(status) { const labels = { submitted: "✓ ส่งแล้ว", pending: "⏳ งานค้าง", missing: "! ไม่ส่ง" }; return `<span class="badge ${status}">${labels[status] || labels.pending}</span>`; }
function formatDate(value) { if (!value) return "—"; return new Date(`${value}T12:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); }
function cleanStudentId(value) { return String(value || "").trim().replace(/\D+/g, ""); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function jsString(value) { return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function setLoading(show) { $("#loading").classList.toggle("hidden", !show); }
function toast(message, isError = false) { const element = $("#toast"); element.textContent = message; element.className = `toast show${isError ? " error" : ""}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => element.className = "toast", 2600); }

window.openRoster = openRoster;
window.openAssignmentDialog = openAssignmentDialog;
window.archiveAssignment = archiveAssignment;
window.changeStatus = changeStatus;// แก้ปุ่ม ดูรายชื่อ / แก้ไข / ปิดงาน
// ให้ทำงานโดยไม่พึ่ง inline onclick
document.addEventListener(
  "click",
  function (event) {
    const button = event.target.closest(".assignment-actions button");

    if (!button) return;

    const oldOnclick = button.getAttribute("onclick") || "";
    const idMatch = oldOnclick.match(/'([^']+)'/);

    if (!idMatch) return;

    event.preventDefault();
    event.stopPropagation();

    const assignmentId = idMatch[1];
    const action = button.textContent.trim();

    if (action === "ดูรายชื่อ") {
      openRoster(assignmentId);
      return;
    }

    if (action === "แก้ไข") {
      openAssignmentDialog(assignmentId);
      return;
    }

    if (action === "ปิดงาน") {
      archiveAssignment(assignmentId);
    }
  },
  true
);
