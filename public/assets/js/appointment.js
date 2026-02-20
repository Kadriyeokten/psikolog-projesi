// appointment.js

document.addEventListener("DOMContentLoaded", () => {
  loadDynamicData();
  initCalendar();
});

function initCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    locale: "tr",
    slotMinTime: "08:00:00",
    slotMaxTime: "20:00:00",
    selectable: true,
    allDaySlot: false,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "timeGridWeek,timeGridDay",
    },
    buttonText: {
      today: "Bugün",
      month: "Ay",
      week: "Hafta",
      day: "Gün",
      list: "Liste",
    },
    select: function (info) {
      const selectedDate = info.startStr;
      document.getElementById("selectedDateTime").value = selectedDate;
      alert("Seçilen Randevu Zamanı: " + info.start.toLocaleString("tr-TR"));
    },
  });

  calendar.render();
}

async function loadDynamicData() {
  const serviceSelect = document.getElementById("service");
  const therapistSelect = document.getElementById("therapist");

  if (!serviceSelect || !therapistSelect) return;

  try {
    // Hizmetleri yükle
    const servicesRes = await fetch("/api/services");
    const services = await servicesRes.json();

    serviceSelect.innerHTML = '<option value="">Hizmet Seçin</option>';
    services.forEach((service) => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = service.title;
      serviceSelect.appendChild(option);
    });

    // Doktorları yükle
    const doctorsRes = await fetch("/api/doctors");
    const doctors = await doctorsRes.json();

    therapistSelect.innerHTML = '<option value="">Terapist Seçin</option>';
    doctors.forEach((doc) => {
      if (doc.is_active !== false) { // Sadece aktif doktorları göster
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
