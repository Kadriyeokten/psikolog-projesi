// appointment.js

document.addEventListener("DOMContentLoaded", () => {
  loadDynamicData();
  initCalendar();
  autoFillUserData();
  updateAppointmentWhatsAppLink();
});

async function updateAppointmentWhatsAppLink() {
  try {
    const res = await fetch("/api/site-content");
    const data = await res.json();
    if (data && data.whatsapp_number) {
      const link = document.getElementById("appointmentWhatsappBtn");
      if (link) {
        const lang = localStorage.getItem("preferredLanguage") || "tr";
        const text = lang === "en" ? "Hello, I would like to book an appointment." : "Merhaba, randevu oluşturmak istiyorum.";
        link.href = `https://wa.me/${data.whatsapp_number}?text=${encodeURIComponent(text)}`;
      }
    }
  } catch (err) { console.error("Appointment WA update error:", err); }
}

async function autoFillUserData() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const response = await fetch("/api/user/me", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (response.ok) {
      const user = await response.json();
      
      const nameInput = document.getElementById("patientName");
      const phoneInput = document.getElementById("patientPhone");
      const emailInput = document.getElementById("patientEmail");
      
      if (nameInput && user.name) {
        // İsim ve soyisimi birleştirerek yazdır
        nameInput.value = `${user.name} ${user.surname || ''}`.trim();
      }
      
      if (phoneInput && user.phone) {
        phoneInput.value = user.phone;
      }
      
      if (emailInput && user.email) {
        emailInput.value = user.email;
      }
    }
  } catch (err) {
    console.error("Kullanıcı bilgileri alınamadı:", err);
  }
}

async function initCalendar() {
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
    buttonText: currentLang === 'tr' ? {
      today: "Bugün",
      week: "Hafta",
      day: "Gün"
    } : {
      today: "Today",
      week: "Week",
      day: "Day"
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
    select: async function (info) {
      const selectedDate = info.startStr;
      document.getElementById("selectedDateTime").value = selectedDate;
      const formattedDate = info.start.toLocaleString(currentLang === 'tr' ? "tr-TR" : "en-US");
      const msg = await window.i18n.t("appointment_datetime_label");
      
      Swal.fire({
        icon: 'info',
        title: msg,
        text: formattedDate,
        confirmButtonColor: 'var(--verdigris)'
      });
    },
  });

  calendar.render();
  window.currentCalendar = calendar;
}

let clinicDoctorId = null; // Hold the doctor ID for subdomains
let allServices = []; // Store all services to access price

async function loadDynamicData() {
  const serviceSelect = document.getElementById("service");
  const therapistSelect = document.getElementById("therapist");
  const therapistBox = document.getElementById("therapist-selection-box");

  if (!serviceSelect || !therapistSelect || !therapistBox) return;

  // Check if we are on a subdomain
  const hostname = window.location.hostname;
  let isSubdomain = false;
  if (hostname.includes('.localhost') && hostname !== 'localhost') {
    isSubdomain = true;
  } else if (hostname.split('.').length >= 3 && hostname.split('.')[0] !== 'www') {
    isSubdomain = true;
  }

  try {
    const servicesRes = await fetch(`/api/services?t=${Date.now()}`);
    allServices = await servicesRes.json(); // Store services globally
    
    serviceSelect.innerHTML = `<option value="">${await window.i18n.t("select_service")}</option>`;
    for (const service of allServices) {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = await window.i18n.t(service.title);
      serviceSelect.appendChild(option);
    }
const doctorsRes = await fetch(`/api/doctors?t=${Date.now()}`);
const doctors = await doctorsRes.json();

if (isSubdomain && doctors.length > 0) {
  // Alt domaindeyiz: Seçim kutusunu gizle ve zorunluluğu kaldır
  therapistBox.style.display = 'none';
  therapistSelect.removeAttribute('required');
  clinicDoctorId = doctors[0].id;

  // Select kutusuna da değerini atayalım (garanti olsun)
  const opt = document.createElement("option");
  opt.value = clinicDoctorId;
  opt.textContent = doctors[0].full_name;
  opt.selected = true;
  therapistSelect.appendChild(opt);
} else {
  // Ana domaindeyiz: Seçim kutusunu göster ve içini doldur
  therapistBox.style.display = 'block';
  therapistSelect.setAttribute('required', 'required');
  therapistSelect.innerHTML = `<option value="">${await window.i18n.t("select_therapist")}</option>`;
  for (const doc of doctors) {
    if (doc.is_active !== false) {
      const option = document.createElement("option");
      option.value = doc.id;
      const translatedTitle = await window.i18n.t(doc.title || "Terapist");
      option.textContent = doc.full_name + " (" + translatedTitle + ")";
      therapistSelect.appendChild(option);
    }
  }
}


  } catch (err) {
    console.error("Dinamik veriler yüklenemedi:", err);
  }
}

// Hizmet seçimi değiştiğinde fiyatı göster
document.getElementById("service")?.addEventListener("change", function() {
  const serviceId = this.value;
  const priceDisplay = document.getElementById("price-display");
  const priceSpan = document.getElementById("service-price");
  
  if (serviceId && allServices.length > 0) {
    const selectedService = allServices.find(s => s.id == serviceId);
    if (selectedService && selectedService.price > 0) {
      priceSpan.textContent = selectedService.price;
      priceDisplay.style.display = 'block';
    } else {
      priceDisplay.style.display = 'none';
    }
  } else {
    priceDisplay.style.display = 'none';
  }
});



// Re-render when language changes
window.addEventListener('languageChanged', async () => {
  if (window.currentCalendar) {
    window.currentCalendar.destroy();
  }
  await initCalendar();
  await loadDynamicData();
});

// Form Gönderim İşlemi (Randevu Kaydı)
document.getElementById("appointmentForm")?.addEventListener("submit", async function(e) {
  e.preventDefault();

  const patientName = document.getElementById("patientName").value.trim();
  const patientPhone = document.getElementById("patientPhone").value.trim();
  const patientEmail = document.getElementById("patientEmail").value.trim();
  const serviceId = document.getElementById("service").value;
  const selectedDateTime = document.getElementById("selectedDateTime").value;
  const therapistId = clinicDoctorId || document.getElementById("therapist").value;

  if (!serviceId) {
     Swal.fire({ icon: 'warning', text: await window.i18n.t("select_service") });
     return;
  }
  if (!therapistId) {
     Swal.fire({ icon: 'warning', text: await window.i18n.t("appointment_error_therapist") });
     return;
  }
  if (!selectedDateTime) {
    Swal.fire({ icon: 'warning', text: await window.i18n.t("appointment_error_date") });
    return;
  }

  const selectedService = allServices.find(s => s.id == serviceId);
  if (!selectedService) {
    Swal.fire({ icon: 'error', text: "Seçilen hizmet bulunamadı!" });
    return;
  }
  
  const d = new Date(selectedDateTime);
  const localDateTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;

  const userId = localStorage.getItem("userId");
  const serviceText = selectedService.title;
  const therapistSelect = document.getElementById("therapist");
  let therapistText = "Klinik Terapisti";
  if (therapistSelect.selectedIndex > 0) {
      therapistText = therapistSelect.options[therapistSelect.selectedIndex].text;
  }
  
  const data = {
    userId,
    patientName,
    patientPhone,
    patientEmail,
    service: serviceId,
    service_name: serviceText,
    service_price: selectedService.price,
    therapist: therapistId,
    doctor_name: therapistText,
    selectedDateTime: localDateTime
  };

  sessionStorage.setItem('pending_appointment', JSON.stringify(data));
  window.location.href = "payment.html";
});

async function showRegistrationPrompt(name, email, phone, appointmentId) {
  const title = await window.i18n.t("appointment_register_prompt_title");
  const text = await window.i18n.t("appointment_register_prompt_text");
  const confirmBtn = await window.i18n.t("appointment_register_confirm_btn");
  const cancelBtn = await window.i18n.t("appointment_register_cancel_btn");
  const passwordLabel = await window.i18n.t("appointment_register_password_label");
  const passwordPlaceholder = await window.i18n.t("appointment_register_password_placeholder");

  const result = await Swal.fire({
    title: title,
    text: text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmBtn,
    cancelButtonText: cancelBtn,
    confirmButtonColor: 'var(--verdigris)',
    cancelButtonColor: '#aaa',
  });

  if (result.isConfirmed) {
    const { value: password } = await Swal.fire({
      title: passwordLabel,
      input: 'password',
      inputPlaceholder: passwordPlaceholder,
      inputAttributes: {
        autocapitalize: 'off',
        autocorrect: 'off'
      },
      showCancelButton: true,
      confirmButtonColor: 'var(--verdigris)',
      cancelButtonText: cancelBtn,
      inputValidator: (value) => {
        if (!value) {
          return 'Şifre gereklidir!';
        }
        if (value.length < 6) {
          return 'Şifre en az 6 karakter olmalıdır!';
        }
      }
    });

    if (password) {
      try {
        // İsim ve soyisimi ayırmaya çalış (backend surname bekliyor olabilir)
        const nameParts = name.trim().split(" ");
        const firstName = nameParts[0];
        const surname = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

        // Kayıt Ol (Randevu ID'sini de gönderiyoruz)
        const signupRes = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: firstName,
            surname: surname,
            email: email,
            phone: phone,
            password: password,
            appointmentId: appointmentId
          })
        });

        if (signupRes.ok) {
          // Otomatik Giriş Yap
          const loginRes = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
          });

          if (loginRes.ok) {
            const loginData = await loginRes.json();
            localStorage.setItem("token", loginData.token);
            localStorage.setItem("role", loginData.role);
            localStorage.setItem("name", loginData.name);
            localStorage.setItem("userId", loginData.userId);

            const successMsg = await window.i18n.t("appointment_register_success");
            await Swal.fire({
              icon: 'success',
              title: successMsg,
              confirmButtonColor: 'var(--verdigris)'
            });
            
            // Profil sayfasına yönlendir veya sayfayı yenile
            window.location.reload();
          }
        } else {
          const errorData = await signupRes.json();
          throw new Error(errorData.error || "Kayıt hatası");
        }
      } catch (err) {
        console.error(err);
        const errorMsg = await window.i18n.t("appointment_register_error");
        Swal.fire({
          icon: 'error',
          title: 'Hata',
          text: err.message || errorMsg,
          confirmButtonColor: 'var(--verdigris)'
        });
      }
    }
  } else {
    // Kayıt olmak istemedi, sadece randevu başarı mesajını göster
    const successMsg = await window.i18n.t("appointment_success");
    Swal.fire({
      icon: 'success',
      title: successMsg,
      confirmButtonColor: 'var(--verdigris)'
    });
  }
}
