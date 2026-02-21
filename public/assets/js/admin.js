document.addEventListener("DOMContentLoaded", () => {
  const sidebarLinks = document.querySelectorAll(".admin-sidebar ul li a");
  const adminSections = document.querySelectorAll(".admin-section");

  // Sidebar navigasyonunu yönet
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetSectionId = link.getAttribute("data-section");
      
      // Eğer data-section yoksa default davranışı engelleme (Siteye Dön linki gibi)
      if (!targetSectionId) return;

      e.preventDefault();
      sidebarLinks.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");

      adminSections.forEach((section) => {
        if (section.id === targetSectionId) {
          section.classList.add("active");
        } else {
          section.classList.remove("active");
        }
      });
    });
  });

  // Hakkimizda Görseli Önizleme
  const aboutUsImageInput = document.getElementById("aboutUsImage");
  const aboutUsImagePreview = document.getElementById("about_image"); // DÜZELTİLDİ

  if (aboutUsImageInput) {
    aboutUsImageInput.addEventListener("change", function () {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          aboutUsImagePreview.src = e.target.result;
          aboutUsImagePreview.style.display = "block";
        };
        reader.readAsDataURL(file);
      } else {
        aboutUsImagePreview.src = "#";
        aboutUsImagePreview.style.display = "none";
      }
    });
  }

  const saveAboutBtn = document.getElementById("saveAboutUs");

  if (saveAboutBtn) {
    saveAboutBtn.addEventListener("click", () => {
      saveAbout();
    });
  }

  const saveDoctorBtn = document.getElementById("addDoctor");

  if (saveDoctorBtn) {
    saveDoctorBtn.addEventListener("click", () => {
      saveDoctor();
    });
  }

  // İlk bölümü aktif yap
  if (document.getElementById("dashboard")) {
    document.getElementById("dashboard").classList.add("active");
  }
});

fetch("/api/site-content")
  .then((res) => res.json())
  .then((data) => {
    document.getElementById("about_title").value = data.about_title;
    document.getElementById("about_text").value = data.about_text;
    document.getElementById("feature_title1").value = data.feature_title1;
    document.getElementById("feature_title2").value = data.feature_title2;
    document.getElementById("feature_title3").value = data.feature_title3;
    document.getElementById("feature_desc1").value = data.feature_desc1;
    document.getElementById("feature_desc2").value = data.feature_desc2;
    document.getElementById("feature_desc3").value = data.feature_desc3;
    document.getElementById("feature1").value = data.feature1;
    document.getElementById("feature2").value = data.feature2;
    document.getElementById("feature3").value = data.feature3;
    document.getElementById("feature4").value = data.feature4;
    //document.getElementById("about_image").value = data.about_image;

    const img = document.getElementById("about_image");

    if (data.about_image) {
      img.src = data.about_image;
      img.style.display = "block";
    }
  })
  .catch((err) => {
    console.error("Veri çekilemedi:", err);
  });

document
  .getElementById("aboutUsImage")
  .addEventListener("change", function (e) {
    const file = e.target.files[0];

    if (!file) return;

    const img = document.getElementById("aboutUsImage");

    img.src = URL.createObjectURL(file);
    img.style.display = "block";
  });

async function saveAbout() {
  const formData = new FormData();

  formData.append("about_title", document.getElementById("about_title").value);
  formData.append("about_text", document.getElementById("about_text").value);

  formData.append(
    "feature_title1",
    document.getElementById("feature_title1").value,
  );
  formData.append(
    "feature_title2",
    document.getElementById("feature_title2").value,
  );
  formData.append(
    "feature_title3",
    document.getElementById("feature_title3").value,
  );

  formData.append(
    "feature_desc1",
    document.getElementById("feature_desc1").value,
  );
  formData.append(
    "feature_desc2",
    document.getElementById("feature_desc2").value,
  );
  formData.append(
    "feature_desc3",
    document.getElementById("feature_desc3").value,
  );

  formData.append("feature1", document.getElementById("feature1").value);
  formData.append("feature2", document.getElementById("feature2").value);
  formData.append("feature3", document.getElementById("feature3").value);
  formData.append("feature4", document.getElementById("feature4").value);

  const file = document.getElementById("aboutUsImage").files[0];
  if (file) {
    formData.append("image", file);
  }

  try {
    const res = await fetch("/api/site-content/about", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.success) {
      alert("Kaydedildi");
    } else {
      alert("Hata: " + data.error);
    }
  } catch (err) {
    console.error(err);
    alert("Hakkimizda kaydedilemedi");
  }
}

async function saveDoctor() {
  const name = document.getElementById("doctorName").value;
  const title = document.getElementById("doctorTitle").value;
  const phone = document.getElementById("doctorPhone").value;
  const email = document.getElementById("doctorEmail").value;

  const instagram = document.getElementById("doctorInstagram").value;
  const twitter = document.getElementById("doctorTwitter").value;
  const facebook = document.getElementById("doctorFacebook").value;
  const linkedin = document.getElementById("doctorLinkedin").value;
  const isActive = document.getElementById("doctorIsActive").checked;
  const bio = document.getElementById("doctorBio").value;

  const imageFile = document.getElementById("doctorImage").files[0];

  if (!name) {
    alert("Ad Soyad zorunlu!");
    return;
  }

  const formData = new FormData();

  formData.append("full_name", name);
  formData.append("title", title);
  formData.append("phone", phone);
  formData.append("email", email);

  formData.append("instagram", instagram);
  formData.append("twitter", twitter);
  formData.append("facebook", facebook);
  formData.append("linkedin", linkedin);
  formData.append("is_active", isActive);
  formData.append("bio", bio);

  if (imageFile) {
    formData.append("image", imageFile);
  }

  try {
    const res = await fetch("/api/doctors", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.success) {
      alert("Doktor eklendi ");
      location.reload();
    } else {
      alert("Kayıt başarısız ");
    }
  } catch (err) {
    console.error(err);
    alert("Sunucu hatası");
  }
}
