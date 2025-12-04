function updatePrice() {
    let prix = (Math.random() * 1000).toFixed(2);
    document.getElementById('prix').textContent = prix;
}
