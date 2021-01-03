jQuery(document).ready(function($){
  $(".sidebar-control").on('click', _ => {
    document.getElementById("sidebar").classList.toggle("collapsed");
    document.getElementById("sidebar-header").classList.toggle("collapsed");
  });

  function entry_icon(type) {
      if (type == "M")
          return "<div style='background-color:#0bc32b;' class='marker-pin'></div><i class='material-icons' style='color: rgb(0, 0, 0);'>house</i>";
      if (type == "T3")
          return "<div style='background-color:#c30b82;' class='marker-pin'></div><span style='color: rgb(0, 0, 0);'>T3</span>";
      if (type == "T4")
          return "<div style='background-color:#0b73c3;' class='marker-pin'></div><span style='color: rgb(0, 0, 0);'>T4</span>";
  }

  let placesApp = Vue.createApp({
    data() {
      return {
        map: null,
        popup: L.popup(),
        places: [],
        selectedPlace: undefined
      }
    },
    mounted() {
      this.initMap();
      this.loadPlaces();
    },
    methods: {
      initMap() {
        var vm = this;
        this.map = L.map('map', {zoomControl: false}).setView([48.77199820642046, 2.0856456177490124], 15);

        L.control.zoom({position:'topright'}).addTo(this.map);

        L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
          attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
          id: 'mapbox/streets-v11',
          tileSize: 512,
          zoomOffset: -1
        }).addTo(this.map);

        this.map.on('click', function(e) {
          vm.popup
          .setLatLng(e.latlng)
          .setContent(e.latlng.toString())
          .openOn(this);
        });
      },
      title(p) { return p.surface + 'm² ' + p.price + 'k ' + Math.round(1000 * p.price / p.surface) + '/m²'; },
      addPlaceToMap(p) {
        var vm = this;
        p.marker = L.marker([p.lat, p.lon],
          {
            icon: L.divIcon({
              className: 'custom-div-icon',
              html: entry_icon(p.type),
              iconSize: [30, 42],
              iconAnchor: [15, 42]
            })
          })
          .addTo(this.map)
          .bindTooltip(this.title(p), {permanent: true, direction: 'right', offset: {x: 10, y: -19}, className: 'text-only-tooltip'});
          p.marker.place = p;
          p.marker.on('click', function(e) { vm.selectedPlace = e.target.place; });
      },
      loadPlaces() {
        var vm = this;
        axios({method: 'get', url: '/places', responseType: 'json', headers: {'Accept': 'application/json' }})
        .then(function (response) {
          response.data.forEach(e => { e.visible = true; e.selected = false; });
          vm.places = response.data;
          vm.places.forEach(vm.addPlaceToMap);
          });
      },
      placeVisibilityChanged(place) {
        if (place.visible)
          place.marker.addTo(this.map);
        else
          place.marker.remove();
      }
    },
    watch: {
      selectedPlace(curr, prev) {
        if (prev)
          prev.selected = false;
          curr.selected = true;
        this.map.setView([curr.lat, curr.lon]);
      }
    }
  });
  var placesVM = placesApp.mount('#places');
});
