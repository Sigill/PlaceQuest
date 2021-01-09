var placesVM = undefined;
jQuery(document).ready(function($){
  let map = L.map('map', {zoomControl: false});
  map.fitWorld();

  L.control.zoom({position:'topright'}).addTo(map);

  L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1
  }).addTo(map);

  function placeTitle(p) { return `${p.type} ${p.surface}m² ${p.price}k ${Math.round(1000 * p.price / p.surface)}/m²`; }

  function LeafletTooltipApp(place) {
    return Vue.createApp({}).component('leaflet-place-tooltip', {
      data() { return { place: place } },
      methods: {
        title() { return placeTitle(this.place); }
      },
      render() { return Vue.createTextVNode(this.title()); }
    });
  }

  function LeafletPlaceMarkerApp(place) {
    return Vue.createApp({}).component('leaflet-place-marker', {
      data() { return { place: place } },
      methods: {
        markerColor() {
          if (this.place.type == 'H') return '#0bc32b';
          if (this.place.type == 'T2') return '#c30b82';
          if (this.place.type == 'T3') return '#0b73c3';
        }
      },
      template: `
      <div :style="{ backgroundColor: markerColor() }" class="marker-pin"></div>
      <i v-if="place.type === 'H'" class="material-icons" style="color: rgb(0, 0, 0);">house</i>
      <span v-else-if="place.type === 'T3' || place.type === 'T4'" style="color: rgb(0, 0, 0);">{{ place.type }}</span>
      `
    });
  }

  let placesApp = Vue.createApp({
    data() {
      return {
        places: [],
        selectedPlace: undefined,
        formModel: {},
        mode: undefined
      }
    },
    computed: {
      modal() { return new bootstrap.Modal(document.getElementById('placeEditModal')); }
    },
    methods: {
      decoratePlaceModel(p) { p.visible = true; p.selected = false; },
      addPlaceToMap(p) {
        var vm = this;

        p.markerIconApp = LeafletPlaceMarkerApp(p);
        let markerIconNode = document.createElement('div');
        {
          markerIconNode.appendChild(document.createElement('leaflet-place-marker'));
          p.markerIconApp.mount(markerIconNode);
        }

        p.markerTooltipApp = LeafletTooltipApp(p);
        let markerTooltipNode = document.createElement('span');
        {
          markerTooltipNode.appendChild(document.createElement('leaflet-place-tooltip'));
          p.markerTooltipApp.mount(markerTooltipNode);
        }

        p.marker = L.marker([p.lat, p.lon],
          {
            icon: L.divIcon({
              className: 'custom-div-icon',
              html: markerIconNode,
              iconSize: [30, 42],
              iconAnchor: [15, 42]
            })
          });

        p.marker.bindTooltip(markerTooltipNode,
                             {permanent: true, direction: 'right', offset: {x: 10, y: -19}, className: 'text-only-tooltip'});

        p.marker.on('click', function(e) { vm.selectedPlace = p; });

        p.marker.addTo(map);
      },
      registerPlace(p) {
        this.decoratePlaceModel(p);
        this.places.unshift(p);
        this.addPlaceToMap(p);
      },
      title(p) { return placeTitle(p); },
      placeVisibilityChanged(place) {
        if (place.visible)
          place.marker.addTo(map);
        else
          place.marker.remove();
      },
      openForm() { this.modal.show(); },
      discardForm() {
        this.mode = undefined;
        this.formModel.id = undefined;
        this.formModel.type = undefined;
        this.formModel.title = undefined;
        this.formModel.surface = undefined;
        this.formModel.price = undefined;
        this.formModel.description = undefined;
        this.formModel.sold = undefined;
        this.formModel.future = undefined;
        this.modal.hide();
      },
      edit(p) {
        this.mode = 'editPlace';
        this.formModel.id = p.id;
        this.formModel.type = p.type;
        this.formModel.title = p.title;
        this.formModel.surface = p.surface;
        this.formModel.price = p.price;
        this.formModel.description = p.description;
        this.formModel.sold = p.sold;
        this.formModel.future = p.future;
        this.openForm();
      },
      create() {
        let vm = this;
        axios.post('/places',
                  JSON.stringify(this.formModel),
                  {responseType: 'json', headers: {'Accept': 'application/json' }})
        .then(response => vm.registerPlace(response.data))
        .catch(function (error) {
          let data = error.response.data.errors;
          let first = Object.keys(data)[0];
          alert(`Error: ${first} ${data[first]}`);
        });
      },
      update() {
        let vm = this;
        axios.put(`/places/${this.formModel.id}`,
                  JSON.stringify(this.formModel),
                  {responseType: 'json', headers: {'Accept': 'application/json' }})
        .then(function (response) {
          let data = response.data;
          let dest = vm.places.find((p) => p.id == data.id);
          if (dest) {
            dest.type = data.type;
            dest.surface = data.surface;
            dest.price = data.price;
          } else {
            alert("Something wrong happened");
          }
        }).catch(function (error) {
          let data = error.response.data.errors;
          let first = Object.keys(data)[0];
          alert(`Error: ${first} ${data[first]}`);
        });
      },
      commit() {
        if(this.mode == 'createPlace') {
          this.create();
        } else if (this.mode == 'editPlace') {
          this.update();
        }
        this.discardForm();
        this.mode = undefined;
      },
      enableDepositMode() {
        this.mode = 'depositPlace';
        let vm = this;
        map.once('click', function(e) {
          vm.formModel.id = -1;
          vm.formModel.lat = e.latlng.lat;
          vm.formModel.lon = e.latlng.lng;
          vm.mode = 'createPlace';
          vm.openForm();
        });
      },
      disableDepositMode() {
        map.off('click');
        this.mode = undefined;
      }
    },
    watch: {
      selectedPlace(curr, prev) {
        if (prev)
          prev.selected = false;
        curr.selected = true;
        map.setView([curr.lat, curr.lon]);
      }
    },
    mounted() {
      let vm = this;
      axios({method: 'get', url: '/places', responseType: 'json', headers: {'Accept': 'application/json' }})
      .then(response => {
        response.data.forEach(vm.registerPlace);
        if (vm.places.length > 0) {
          map.setView([vm.places[0].lat, vm.places[0].lon], 15)
        }
      });
    }
  });

  placesVM = placesApp.mount('#places-app');

  $(".sidebar-control").on('click', _ => {
    document.getElementById("sidebar").classList.toggle("collapsed");
    document.getElementById("sidebar-header").classList.toggle("collapsed");
  });
});
