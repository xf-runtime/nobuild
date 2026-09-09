// pages/cp_vehicle.js
// Custom page script for cp_vehicle.html
// Lazily loaded by PageLoader when navigating to cp_vehicle.
(function () {
    window.F = window.F || {};

    window.F.cp_vehicle = {
        calculateTireStatus: function (id) {
            _alertshow(1, `Diagnostics ran for vehicle ID: ${id}`);
        },

        printVehicleBadge: function (entityHdr) {
            window.print();
        }
    };
})();