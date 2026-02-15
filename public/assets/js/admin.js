document.addEventListener('DOMContentLoaded', () => {
    const sidebarLinks = document.querySelectorAll('.admin-sidebar ul li a');
    const adminSections = document.querySelectorAll('.admin-section');

    // Sidebar navigasyonunu yönet
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            sidebarLinks.forEach(item => item.classList.remove('active'));
            link.classList.add('active');

            const targetSectionId = link.getAttribute('data-section');
            adminSections.forEach(section => {
                if (section.id === targetSectionId) {
                    section.classList.add('active');
                } else {
                    section.classList.remove('active');
                }
            });
        });
    });

    // Hakkımızda Görseli Önizleme
    const aboutUsImageInput = document.getElementById('aboutUsImage');
    const aboutUsImagePreview = document.getElementById('aboutUsImagePreview');

    if (aboutUsImageInput) {
        aboutUsImageInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    aboutUsImagePreview.src = e.target.result;
                    aboutUsImagePreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            } else {
                aboutUsImagePreview.src = '#';
                aboutUsImagePreview.style.display = 'none';
            }
        });
    }

    // Kaydet/Ekle butonları için yer tutucu işlevsellik
    const saveButtons = document.querySelectorAll('.admin-content button');
    saveButtons.forEach(button => {
        button.addEventListener('click', () => {
            alert('Bu özellik şu anda sadece ön yüzdedir ve veritabanına kaydedilmemektedir.');
        });
    });

    // İlk bölümü aktif yap
    if (document.getElementById('dashboard')) {
        document.getElementById('dashboard').classList.add('active');
    }
});
