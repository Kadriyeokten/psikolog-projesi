// public/assets/js/admin.js

document.addEventListener("DOMContentLoaded", () => {
  // 1. Sidebar Navigasyonu
  const sidebarLinks = document.querySelectorAll(".admin-sidebar ul li a");
  const adminSections = document.querySelectorAll(".admin-section");

  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetSectionId = link.getAttribute("data-section");
      if (!targetSectionId) return;

      e.preventDefault();
      sidebarLinks.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");

      adminSections.forEach((section) => {
        section.classList.toggle("active", section.id === targetSectionId);
      });
    });
  });

  // 2. İlk Yükleme
  loadSiteContent();
  loadDoctorSelect();
  loadServiceSelect();
  loadAppointments();

  // 3. Buton Event Listenerları
  
  // Hakkımızda Kaydet
  document.getElementById("saveAboutUs")?.addEventListener("click", saveAbout);
  
  // Hizmet İşlemleri
  document.getElementById("addService")?.addEventListener("click", addService);
  document.getElementById("updateService")?.addEventListener("click", updateService);
  document.getElementById("deleteService")?.addEventListener("click", deleteService);
  
  // Doktor İşlemleri
  document.getElementById("addDoctor")?.addEventListener("click", saveDoctor);
  document.getElementById("updateDoctor")?.addEventListener("click", updateDoctor);
  document.getElementById("deleteDoctor")?.addEventListener("click", deleteDoctor);

  // Görsel Önizlemeleri
  setupImagePreview("aboutUsImage", "about_image");
  setupImagePreview("serviceImage", "service_image");
  setupImagePreview("doctorImage", "doctor_image");
});

// --- YARDIMCI FONKSİYONLAR ---

function setupImagePreview(inputId, imgId) {
  const input = document.getElementById(inputId);
  const img = document.getElementById(imgId);
  if (input && img) {
    input.addEventListener("change", function () {
      const file = this.files[0];
      if (file) {
        img.src = URL.createObjectURL(file);
        img.style.display = "block";
      }
    });
  }
}

async function loadSiteContent() {
  try {
    const res = await fetch("/api/site-content");
    const data = await res.json();
    if (data) {
      if(document.getElementById("about_title")) document.getElementById("about_title").value = data.about_title || "";
      if(document.getElementById("about_text")) document.getElementById("about_text").value = data.about_text || "";
      if(document.getElementById("feature_title1")) document.getElementById("feature_title1").value = data.feature_title1 || "";
      if(document.getElementById("feature_title2")) document.getElementById("feature_title2").value = data.feature_title2 || "";
      if(document.getElementById("feature_title3")) document.getElementById("feature_title3").value = data.feature_title3 || "";
      if(document.getElementById("feature_desc1")) document.getElementById("feature_desc1").value = data.feature_desc1 || "";
      if(document.getElementById("feature_desc2")) document.getElementById("feature_desc2").value = data.feature_desc2 || "";
      if(document.getElementById("feature_desc3")) document.getElementById("feature_desc3").value = data.feature_desc3 || "";
      if(document.getElementById("feature1")) document.getElementById("feature1").value = data.feature1 || "";
      if(document.getElementById("feature2")) document.getElementById("feature2").value = data.feature2 || "";
      if(document.getElementById("feature3")) document.getElementById("feature3").value = data.feature3 || "";
      if(document.getElementById("feature4")) document.getElementById("feature4").value = data.feature4 || "";
      
      const img = document.getElementById("about_image");
      if (img && data.about_image) {
        img.src = data.about_image;
        img.style.display = "block";
      }
    }
  } catch (err) { console.error("Veri çekilemedi:", err); }
}

async function saveAbout() {
  const formData = new FormData();
  formData.append("about_title", document.getElementById("about_title").value);
  formData.append("about_text", document.getElementById("about_text").value);
  formData.append("feature_title1", document.getElementById("feature_title1").value);
  formData.append("feature_title2", document.getElementById("feature_title2").value);
  formData.append("feature_title3", document.getElementById("feature_title3").value);
  formData.append("feature_desc1", document.getElementById("feature_desc1").value);
  formData.append("feature_desc2", document.getElementById("feature_desc2").value);
  formData.append("feature_desc3", document.getElementById("feature_desc3").value);
  formData.append("feature1", document.getElementById("feature1").value);
  formData.append("feature2", document.getElementById("feature2").value);
  formData.append("feature3", document.getElementById("feature3").value);
  formData.append("feature4", document.getElementById("feature4").value);

  const file = document.getElementById("aboutUsImage").files[0];
  if (file) formData.append("image", file);

  try {
    const res = await fetch("/api/site-content/about", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) alert("Hakkımızda içeriği güncellendi!");
    else alert("Hata: " + data.error);
  } catch (err) { alert("Sunucu hatası!"); }
}

// --- HİZMET YÖNETİMİ ---

async function loadServiceSelect() {
  const select = document.getElementById("serviceSelect");
  if (!select) return;
  try {
    const res = await fetch("/api/services");
    const services = await res.json();
    select.innerHTML = '<option value="">Yeni Hizmet Ekle</option>';
    services.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.title;
      select.appendChild(opt);
    });
  } catch (err) { console.error(err); }
}

document.getElementById("serviceSelect")?.addEventListener("change", async function() {
  const id = this.value;
  if (!id) { clearServiceForm(); return; }
  try {
    const res = await fetch(`/api/services/${id}`);
    const s = await res.json();
    document.getElementById("serviceTitle").value = s.title;
    document.getElementById("serviceDesc").value = s.dsc;
    const img = document.getElementById("service_image");
    if (s.image_path) { img.src = s.image_path; img.style.display = "block"; }
    else img.style.display = "none";
  } catch (err) { console.error(err); }
});

async function addService() {
  const title = document.getElementById("serviceTitle").value;
  const dsc = document.getElementById("serviceDesc").value;
  const file = document.getElementById("serviceImage").files[0];
  if (!title || !dsc) return alert("Başlık ve açıklama girin!");

  const formData = new FormData();
  formData.append("title", title);
  formData.append("dsc", dsc);
  if (file) formData.append("image", file);

  try {
    const res = await fetch("/api/services", { method: "POST", body: formData });
    if (res.ok) { 
      // Trigger auto-translation
      await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });
      await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: dsc, target: 'en'}) });
      
      alert("Hizmet eklendi!"); 
      clearServiceForm(); 
      loadServiceSelect(); 
    }
  } catch (err) { alert("Ekleme hatası!"); }
}

async function updateService() {
  const id = document.getElementById("serviceSelect").value;
  if (!id) return alert("Lütfen bir hizmet seçin!");
  const title = document.getElementById("serviceTitle").value;
  const dsc = document.getElementById("serviceDesc").value;
  const file = document.getElementById("serviceImage").files[0];

  const formData = new FormData();
  formData.append("title", title);
  formData.append("dsc", dsc);
  if (file) formData.append("image", file);

  try {
    const res = await fetch(`/api/services/${id}`, { method: "PUT", body: formData });
    if (res.ok) { 
      // Trigger auto-translation
      await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });
      await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: dsc, target: 'en'}) });

      alert("Hizmet güncellendi!"); 
      loadServiceSelect(); 
    }
  } catch (err) { alert("Güncelleme hatası!"); }
}

async function deleteService() {
  const id = document.getElementById("serviceSelect").value;
  if (!id || !confirm("Emin misiniz?")) return;
  try {
    const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
    if (res.ok) { alert("Silindi!"); clearServiceForm(); loadServiceSelect(); }
  } catch (err) { alert("Silme hatası!"); }
}

function clearServiceForm() {
  document.getElementById("serviceTitle").value = "";
  document.getElementById("serviceDesc").value = "";
  document.getElementById("service_image").style.display = "none";
  document.getElementById("serviceImage").value = "";
}

// --- DOKTOR YÖNETİMİ ---

async function loadDoctorSelect() {
  const select = document.getElementById("doctorSelect");
  if (!select) return;
  try {
    const res = await fetch("/api/doctors");
    const doctors = await res.json();
    select.innerHTML = '<option value="">Doktor Seçiniz</option>';
    doctors.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.full_name;
      select.appendChild(opt);
    });
  } catch (err) { console.error(err); }
}

document.getElementById("doctorSelect")?.addEventListener("change", async function() {
  const id = this.value;
  if (!id) { clearDoctorForm(); return; }
  try {
    const res = await fetch(`/api/doctors/${id}`);
    const d = await res.json();
    document.getElementById("doctorName").value = d.full_name;
    document.getElementById("doctorTitle").value = d.title;
    document.getElementById("doctorPhone").value = d.phone;
    document.getElementById("doctorEmail").value = d.email;
    document.getElementById("doctorInstagram").value = d.instagram || "";
    document.getElementById("doctorTwitter").value = d.twitter || "";
    document.getElementById("doctorFacebook").value = d.facebook || "";
    document.getElementById("doctorLinkedin").value = d.linkedin || "";
    document.getElementById("doctorBio").value = d.bio || "";
    document.getElementById("doctorIsActive").checked = d.is_active;
    
    const img = document.getElementById("doctor_image");
    if (d.image_path) { img.src = d.image_path; img.style.display = "block"; }
    else img.style.display = "none";
  } catch (err) { console.error(err); }
});

async function saveDoctor() {
  const formData = getDoctorFormData();
  try {
    const res = await fetch("/api/doctors", { method: "POST", body: formData });
    if (res.ok) { 
      // Trigger auto-translation for bio and title
      const bio = document.getElementById("doctorBio").value;
      const title = document.getElementById("doctorTitle").value;
      if(bio) await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: bio, target: 'en'}) });
      if(title) await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });
      
      alert("Doktor başarıyla eklendi!"); 
      loadDoctorSelect(); 
      clearDoctorForm(); 
    } else {
      alert("Doktor eklenemedi.");
    }
  } catch (err) { alert("Sunucu hatası!"); }
}

async function updateDoctor() {
  const id = document.getElementById("doctorSelect").value;
  if (!id) return alert("Lütfen güncellenecek doktoru seçin!");
  const formData = getDoctorFormData();
  try {
    const res = await fetch(`/api/doctors/${id}`, { method: "PUT", body: formData });
    if (res.ok) { 
      // Trigger auto-translation updates
      const bio = document.getElementById("doctorBio").value;
      const title = document.getElementById("doctorTitle").value;
      if(bio) await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: bio, target: 'en'}) });
      if(title) await fetch('/api/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({text: title, target: 'en'}) });

      alert("Doktor bilgileri güncellendi!"); 
      loadDoctorSelect(); 
    } else {
      alert("Güncelleme başarısız.");
    }
  } catch (err) { alert("Sunucu hatası!"); }
}

async function deleteDoctor() {
  const id = document.getElementById("doctorSelect").value;
  if (!id) return alert("Lütfen silinecek doktoru seçin!");
  if (!confirm("Bu doktoru silmek istediğinize emin misiniz?")) return;
  try {
    const res = await fetch(`/api/doctors/${id}`, { method: "DELETE" });
    if (res.ok) { 
      alert("Doktor silindi!"); 
      clearDoctorForm();
      loadDoctorSelect(); 
    } else {
      alert("Silme işlemi başarısız.");
    }
  } catch (err) { alert("Sunucu hatası!"); }
}

function getDoctorFormData() {
  const formData = new FormData();
  formData.append("full_name", document.getElementById("doctorName").value);
  formData.append("title", document.getElementById("doctorTitle").value);
  formData.append("phone", document.getElementById("doctorPhone").value);
  formData.append("email", document.getElementById("doctorEmail").value);
  formData.append("instagram", document.getElementById("doctorInstagram").value);
  formData.append("twitter", document.getElementById("doctorTwitter").value);
  formData.append("facebook", document.getElementById("doctorFacebook").value);
  formData.append("linkedin", document.getElementById("doctorLinkedin").value);
  formData.append("is_active", document.getElementById("doctorIsActive").checked);
  formData.append("bio", document.getElementById("doctorBio").value);
  const file = document.getElementById("doctorImage").files[0];
  if (file) formData.append("image", file);
  return formData;
}

function clearDoctorForm() {
  if(document.getElementById("doctorSelect")) document.getElementById("doctorSelect").value = "";
  if(document.getElementById("doctorName")) document.getElementById("doctorName").value = "";
  if(document.getElementById("doctorTitle")) document.getElementById("doctorTitle").value = "";
  if(document.getElementById("doctorPhone")) document.getElementById("doctorPhone").value = "";
  if(document.getElementById("doctorEmail")) document.getElementById("doctorEmail").value = "";
  if(document.getElementById("doctorInstagram")) document.getElementById("doctorInstagram").value = "";
  if(document.getElementById("doctorTwitter")) document.getElementById("doctorTwitter").value = "";
  if(document.getElementById("doctorFacebook")) document.getElementById("doctorFacebook").value = "";
  if(document.getElementById("doctorLinkedin")) document.getElementById("doctorLinkedin").value = "";
  if(document.getElementById("doctorBio")) document.getElementById("doctorBio").value = "";
  if(document.getElementById("doctorIsActive")) document.getElementById("doctorIsActive").checked = false;
  
  const img = document.getElementById("doctor_image");
  if (img) {
    img.src = "#";
    img.style.display = "none";
  }
  if(document.getElementById("doctorImage")) document.getElementById("doctorImage").value = "";
}

// --- RANDEVU YÖNETİMİ ---

async function loadAppointments() {
  const tbody = document.getElementById('appointmentsTableBody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/appointments');
    const apps = await res.json();
    tbody.innerHTML = apps.length ? "" : '<tr><td colspan="6">Randevu yok.</td></tr>';
    apps.forEach(app => {
      const date = new Date(app.appointment_date).toLocaleString("tr-TR");
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${date}</td>
        <td>${app.patient_name}<br>${app.patient_phone}</td>
        <td>${app.service_name || '-'}</td>
        <td>${app.doctor_name || '-'}</td>
        <td>${app.status}</td>
        <td><button class="btn" onclick="deleteAppointment(${app.id})">Sil</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

async function deleteAppointment(id) {
  if (!confirm("Silinsin mi?")) return;
  try {
    const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
    if (res.ok) { alert("Silindi."); loadAppointments(); }
  } catch (err) { console.error(err); }
}
