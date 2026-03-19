// appointment.js

document.addEventListener("DOMContentLoaded", () => {
  loadDynamicData();
  initCalendar();
  autoFillUserData();
});

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

async function loadDynamicData() {
  const serviceSelect = document.getElementById("service");
  const therapistSelect = document.getElementById("therapist");

  if (!serviceSelect || !therapistSelect) return;

  try {
    const servicesRes = await fetch("/api/services");
    const services = await servicesRes.json();

    serviceSelect.innerHTML = `<option value="">${await window.i18n.t("select_service")}</option>`;
    for (const service of services) {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = await window.i18n.t(service.title);
      serviceSelect.appendChild(option);
    }

    const doctorsRes = await fetch("/api/doctors");
    const doctors = await doctorsRes.json();

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

  } catch (err) {
    console.error("Dinamik veriler yüklenemedi:", err);
  }
}

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
  const service = document.getElementById("service").value;
  const therapist = document.getElementById("therapist").value;
  const selectedDateTime = document.getElementById("selectedDateTime").value;

  if (!selectedDateTime) {
    const errMsg = await window.i18n.t("appointment_error_date");
    Swal.fire({
      icon: 'warning',
      text: errMsg,
      confirmButtonColor: 'var(--verdigris)'
    });
    return;
  }
  
  // Format the date locally without converting to UTC (which causes 3 hour offset)
  const d = new Date(selectedDateTime);
  const localDateTime = d.getFullYear() + "-" + 
    String(d.getMonth() + 1).padStart(2, '0') + "-" + 
    String(d.getDate()).padStart(2, '0') + " " + 
    String(d.getHours()).padStart(2, '0') + ":" + 
    String(d.getMinutes()).padStart(2, '0') + ":00";

  const userId = localStorage.getItem("userId");
  const data = {
    userId,
    patientName,
    patientPhone,
    patientEmail,
    service,
    therapist,
    selectedDateTime: localDateTime
  };

  try {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    
    if (res.ok) {
      const isLoggedIn = !!localStorage.getItem("token");
      
      if (!isLoggedIn && patientEmail) {
        // Misafir kullanıcı için kayıt teklifi (sadece email varsa)
        // Randevu ID'sini yakalayıp fonksiyona paslıyoruz
        await showRegistrationPrompt(patientName, patientEmail, patientPhone, result.appointment.id);
      } else {
        const successMsg = await window.i18n.t("appointment_success");
        await Swal.fire({
          icon: 'success',
          title: successMsg,
          confirmButtonColor: 'var(--verdigris)'
        });
      }
      
      document.getElementById("appointmentForm").reset();
      document.getElementById("selectedDateTime").value = "";
      if (window.currentCalendar) {
        window.currentCalendar.refetchEvents();
      }
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Hata',
        text: result.error,
        confirmButtonColor: 'var(--verdigris)'
      });
    }
  } catch (err) {
    console.error(err);
    const serverErrMsg = await window.i18n.t("alert_server_error");
    Swal.fire({
      icon: 'error',
      title: 'Hata',
      text: serverErrMsg,
      confirmButtonColor: 'var(--verdigris)'
    });
  }
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
