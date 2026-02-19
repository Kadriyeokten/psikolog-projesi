document.addEventListener("DOMContentLoaded", () => {
  loadDoctorSelect();
});

async function loadDoctorSelect() {
  const res = await fetch("/api/doctors");
  const doctors = await res.json();

  const select = document.getElementById("doctorSelect");

  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Doktor Seçin";
  select.appendChild(defaultOption);

  doctors.forEach((doc) => {
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.full_name;
    select.appendChild(option);
  });
}

document
  .getElementById("doctorSelect")
  .addEventListener("change", async function () {
    const doctorId = this.value;
    if (!doctorId) return;

    const res = await fetch(`/api/doctors/${doctorId}`);
    const doctor = await res.json();

    document.getElementById("doctorName").value = doctor.full_name || "";
    document.getElementById("doctorTitle").value = doctor.title || "";
    document.getElementById("doctorPhone").value = doctor.phone || "";
    document.getElementById("doctorEmail").value = doctor.email || "";
    document.getElementById("doctorInstagram").value = doctor.instagram || "";
    document.getElementById("doctorTwitter").value = doctor.twitter || "";
    document.getElementById("doctorFacebook").value = doctor.facebook || "";
    document.getElementById("doctorLinkedin").value = doctor.linkedin || "";

    document.getElementById("doctorIsActive").checked =
      doctor.is_active === true;

    const img = document.getElementById("doctor_image");

    if (doctor.image_path) {
      img.src = doctor.image_path;
      img.style.display = "block";
    } else {
      img.style.display = "none";
    }
  });

document.getElementById("doctorImage").addEventListener("change", function () {
  const file = this.files[0];
  const img = document.getElementById("doctor_image");

  if (file) {
    img.src = URL.createObjectURL(file);
    img.style.display = "block";
  }
});

document.getElementById("updateDoctor").addEventListener("click", async () => {
  const doctorId = document.getElementById("doctorSelect").value;

  if (!doctorId) {
    alert("Lütfen doktor seçin");
    return;
  }

  const formData = new FormData();

  formData.append("full_name", document.getElementById("doctorName").value);
  formData.append("title", document.getElementById("doctorTitle").value);
  formData.append("phone", document.getElementById("doctorPhone").value);
  formData.append("email", document.getElementById("doctorEmail").value);
  formData.append(
    "instagram",
    document.getElementById("doctorInstagram").value,
  );
  formData.append("twitter", document.getElementById("doctorTwitter").value);
  formData.append("facebook", document.getElementById("doctorFacebook").value);
  formData.append("linkedin", document.getElementById("doctorLinkedin").value);
  formData.append(
    "is_active",
    document.getElementById("doctorIsActive").checked,
  );

  const file = document.getElementById("doctorImage").files[0];

  if (file) {
    formData.append("image", file);
  }
  try {
    await fetch(`/api/doctors/${doctorId}`, {
      method: "PUT",
      body: formData,
    });

    alert("Doktor güncellendi");
    clearDoctorForm();
  } catch (err) {
    console.error(err);
    alert("Doktor Güncelleme başarısız");
  }
});

document.getElementById("deleteDoctor").addEventListener("click", async () => {
  const id = document.getElementById("doctorSelect").value; // 🔥 BURASI value

  if (!id) {
    alert("Lütfen silinecek doktoru seçin");
    return;
  }

  if (!confirm("Bu doktoru silmek istediğinize emin misiniz?")) return;

  const res = await fetch(`/api/doctors/${id}`, {
    method: "DELETE",
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error);
    return;
  }

  alert("Doktor silindi");

  clearDoctorForm();

  await loadDoctorSelect();

  const select = document.getElementById("doctorSelect");
  select.querySelector(`option[value="${id}"]`).remove();
});

function clearDoctorForm() {
  document.getElementById("doctorSelect").value = "";

  document.getElementById("doctorName").value = "";
  document.getElementById("doctorTitle").value = "";
  document.getElementById("doctorPhone").value = "";
  document.getElementById("doctorEmail").value = "";
  document.getElementById("doctorInstagram").value = "";
  document.getElementById("doctorTwitter").value = "";
  document.getElementById("doctorFacebook").value = "";
  document.getElementById("doctorLinkedin").value = "";

  document.getElementById("doctorIsActive").checked = false;

  const img = document.getElementById("doctor_image");
  img.src = "#";
  img.style.display = "none";

  document.getElementById("doctorImage").value = "";
}
