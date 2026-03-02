// appointment.js

document.addEventListener("DOMContentLoaded", () => {
  loadDynamicData();
  initCalendar();
});

function initCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;

  const currentLang = window.i18n.getLang();

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    locale: currentLang,
    slotMinTime: "08:00:00",
    slotMaxTime: "22:00:00",
    slotDuration: "01:00:00",
    selectable: true,
    allDaySlot: false,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "timeGridWeek,timeGridDay",
    },
    events: "/api/appointments/booked",
    selectOverlap: false,
    selectAllow: function(selectInfo) {
      const now = new Date();
      if (selectInfo.start < now) {
        return false;
      }
      return true;
    },
    select: function (info) {
      const selectedDate = info.startStr;
      document.getElementById("selectedDateTime").value = selectedDate;
      const formattedDate = info.start.toLocaleString(currentLang === 'tr' ? "tr-TR" : "en-US");
      alert(window.i18n.t("appointment_datetime_label") + ": " + formattedDate);
    },
  });

  calendar.render();
  window.currentCalendar = calendar;
}

async function loadDynamicData() {
  const serviceSelect = document.getElementById("service");
  const therapistSelect = document.getElementById("therapist");

  if (!serviceSelect || !therapistSelect) return;

  try {
    const servicesRes = await fetch("/api/services");
    const services = await servicesRes.json();

    serviceSelect.innerHTML = `<option value="">${window.i18n.t("select_service")}</option>`;
    services.forEach((service) => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = service.title;
      serviceSelect.appendChild(option);
    });

    const doctorsRes = await fetch("/api/doctors");
    const doctors = await doctorsRes.json();

    therapistSelect.innerHTML = `<option value="">${window.i18n.t("select_therapist")}</option>`;
    doctors.forEach((doc) => {
      if (doc.is_active !== false) {
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = doc.full_name + " (" + (doc.title || "Terapist") + ")";
        therapistSelect.appendChild(option);
      }
    });

  } catch (err) {
    console.error("Dinamik veriler yüklenemedi:", err);
  }
}

// ... rest of the file ...

// Re-render when language changes
window.addEventListener('languageChanged', () => {
  if (window.currentCalendar) {
    window.currentCalendar.destroy();
  }
  initCalendar();
  loadDynamicData();
});

// Form Gönderim İşlemi (Randevu Kaydı)
document.getElementById("appointmentForm")?.addEventListener("submit", async function(e) {
  e.preventDefault();

  const patientName = document.getElementById("patientName").value.trim();
  const patientPhone = document.getElementById("patientPhone").value.trim();
  const patientEmail = document.getElementById("patientEmail").value.trim();
  const service = document.getElementById("service").value;
  const therapist = document.getElementById("therapist").value;
  const selectedDateTime = document.getElementById("selectedDateTime").value;

  if (!selectedDateTime) {
    alert("Lütfen takvim üzerinden bir randevu tarihi ve saati seçin!");
    return;
  }
  // Seçilen zamanı UTC'ye çevir
  const utcDateTime = new Date(selectedDateTime).toISOString();

  const data = {
    patientName,
    patientPhone,
    patientEmail,
    service,
    therapist,
    selectedDateTime: utcDateTime // UTC formatında gönder
  };

  try {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    
    if (res.ok) {
      alert("Randevunuz başarıyla oluşturuldu! Sizinle en kısa sürede iletişime geçeceğiz.");
      document.getElementById("appointmentForm").reset();
      document.getElementById("selectedDateTime").value = ""; // Takvim seçimini sıfırla
    } else {
      alert("Hata: " + result.error);
    }
  } catch (err) {
    console.error(err);
    alert("Sunucuyla bağlantı kurulamadı. Lütfen daha sonra tekrar deneyin.");
  }
});
