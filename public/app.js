function initMap(map_url, map_attribution) {
  let map = L.map('map', {zoomControl: false});
  map.fitWorld();

  L.control.zoom({position:'bottomleft'}).addTo(map);

  L.tileLayer(map_url, {
    attribution: map_attribution,
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1
  }).addTo(map);

  new ResizeObserver(() => { map.invalidateSize(); }).observe(map._container);

  return map;
}

class Place {
  constructor() {
    this.id = undefined;
    this.lat = undefined;
    this.lon = undefined;
    this.type = undefined;
    this.title = undefined;
    this.surface = undefined;
    this.price = undefined;
    this.description = undefined;
    this.url = undefined;
    this.sold = undefined;
    this.future = undefined;

    this.available = true;
    this.visible = true;
  }

  get prettyTitle() {
    let txt = this.type.abbr;
    if (this.surface || this.price) {
      if (this.surface) txt = `${txt} ${this.surface}m²`;
      if (this.price) txt = `${txt} ${this.price}k€`;
      if (this.surface && this.price) txt = `${txt} ${this.relativePrice} €/m²`;
    } else {
      if (this.title) txt = `${txt} (${this.title})`;
    }
    return txt;
  }

  get relativePrice() {
    return Math.round(1000 * this.price / this.surface);
  }
}

function LeafletTooltipApp(place) {
  return Vue.createApp({}).component('leaflet-place-tooltip', {
    data() { return { place: place } },
    template: `<span :class="{'d-none': !place.available || !place.visible}">{{ place.prettyTitle }}</span>`
  });
}

function LeafletPlaceMarkerApp(place) {
  return Vue.createApp({}).component('leaflet-place-marker', {
    data() { return { place: place } },
    methods: {
      markerColor() { return this.place.sold ? '#999' : this.place.type.color; },
      markerFilter() { return this.place.future ? 'blur(.5px)' : 'none'; }
    },
    template: `
    <div :class="{'d-none': !place.available || !place.visible}">
      <div class="marker-pin" :class="{ stripe: place.future }" :style="{ backgroundColor: markerColor(), color: markerColor(), filter: markerFilter() }" ></div>
      <i v-if="place.type.icon != null" class="material-icons">{{ place.type.icon }}</i>
      <span v-else>{{ place.type.abbr }}</span>
    </div>
    `
  });
}

function initPriceChart(selector) {
  let chart = Highcharts.chart(selector, {
    chart: { animation: false },
    title: { text: '' },
    legend: { enabled: false },
    xAxis: {
      title: { enabled: true, text: 'Surface (m²)' },
      startOnTick: true,
      endOnTick: true,
      showLastLabel: true
    },
    yAxis: {
      title: { text: 'Price (k€)' }
    },
    plotOptions: {
      line: {
        tooltip: {
          pointFormat: '{point.x} m², {point.y:.1f} k€'
        }
      },
      scatter: {
        tooltip: {
          pointFormat: '<b>{point.name}</b> {point.x} m², {point.y} k€'
        }
      }
    },
    series: [{
      type: 'scatter',
      name: 'Prices',
      data: []
    },
    {
      type: 'line',
      name: 'Linear regression',
      color: 'rgba(223, 83, 83, .5)',
      data: []
    }]
  });

  new ResizeObserver(() => { chart.reflow(); }).observe(chart.container.parentElement);

  return chart;
}

function linearRegression(points) {
  let sum_x = 0;
  let sum_y = 0;
  let sum_xy = 0;
  let sum_xx = 0;
  let sum_yy = 0;

  points.forEach((p) => {
    sum_x += p.x;
    sum_y += p.y;
    sum_xy += (p.x*p.y);
    sum_xx += (p.x*p.x);
    sum_yy += (p.y*p.y);
  });

  let slope = (points.length * sum_xy - sum_x * sum_y) / (points.length * sum_xx - sum_x * sum_x);
  let intercept = (sum_y - slope * sum_x) / points.length;
  return {slope, intercept};
}

function applyLinearRegression(points, lr) {
  return points.map((x) => [x, lr.slope * x + lr.intercept]);
}

Array.prototype.uniq = function() {
  return this.filter((item, pos, ary) => !pos || item != ary[pos - 1])
}

function buildPlacesApp(baseurl, map, chart) {
  let placesApp = Vue.createApp({
    data() {
      return {
        place_types: [],
        places: [],
        selectedPlace: undefined,
        formModel: {},
        mode: undefined,
        sidebarMode: 'sidebar-compact',
        headerMode: 'header-hidden',
        sortKey: undefined,
        sortOrder: undefined,
        filter_types: [],
        filter_surface_min: undefined,
        filter_surface_max: undefined,
        filter_price_min: undefined,
        filter_price_max: undefined,
        filter_relprice_min: undefined,
        filter_relprice_max: undefined,
        filter_sold: true,
        filter_unsold: true,
        filter_constructed: true,
        filter_in_construction: true
      }
    },
    computed: {
      editModal() { return new bootstrap.Modal(document.getElementById('placeEditModal')); },
      filteredPlaces() {
        return this.places.filter(p => this.isPlaceFilteredIn(p));
      },
      filteredAndOrderedPlaces() {
        let sel = this.filteredPlaces.slice();

        if (this.sortKey && this.sortOrder) {
          let cmp = (a, b) => { return 0; }

          if (this.sortKey == 'type') {
            cmp = (a, b) => {
              if (a.type.abbr > b.type.abbr) { return 1; }
              if (a.type.abbr < b.type.abbr) { return -1; }
              return 0;
            };
          } else if (this.sortKey == "surf") {
            cmp = (a, b) => { return (a.surface && b.surface) ? (a.surface - b.surface) : 0; };
          } else if (this.sortKey == "price") {
            cmp = (a, b) => { return (a.price && b.price) ? (a.price - b.price) : 0; };
          } else if (this.sortKey == "relprice") {
            cmp = (a, b) => { return (a.surface && b.surface && a.price && b.price) ? (a.relativePrice - b.relativePrice) : 0; };
          }

          sel.sort(cmp);

          if (this.sortOrder == "desc")
            sel.reverse();
        }

        this.places.forEach(p => {
          p.available = sel.includes(p);
        });

        return sel;
      },
      globalSelection() {
        if (this.filteredPlaces.length == 0)
          return undefined;
        if (this.filteredPlaces.some(p => p.visible != this.filteredPlaces[0].visible))
          return undefined;
        return this.filteredPlaces.every(p => p.visible);
      },
      stats() {
        const candidates = this.filteredPlaces.filter((p) => p.surface && p.price && p.visible).sort((a, b) => a.surface > b.surface);
        const data_prices = candidates.map((p) => { return {x: p.surface, y: p.price, color: p.type.color, name: p.type.abbr}; });
        const lr = linearRegression(data_prices);
        let data_linreg = applyLinearRegression(
          data_prices.map(p => p.x).uniq(),
          lr);
        return {prices: data_prices, regression: data_linreg};
      }
    },
    methods: {
      updatePlace(p, o) {
        p.lat = o.lat;
        p.lon = o.lon;
        p.type = this.place_types.find(t => t.id == o.type_id);
        p.title = o.title;
        p.surface = o.surface;
        p.price = o.price;
        p.description = o.description;
        p.url = o.url;
        p.sold = o.sold;
        p.future = o.future;
      },
      makePlace(o) {
        let p = new Place();
        p.id = o.id;
        this.updatePlace(p, o);
        return p;
      },
      registerPlace(p) {
        this.places.unshift(p);
        this.addPlaceToMap(p);
      },
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

        p.marker.on('click', function(e) {
          vm.setSelectedPlace(p, true);
        });

        p.marker.on('dragend', function(e) {
          vm.sendRelocationRequest(p, e.target.getLatLng().lat, e.target.getLatLng().lng);
        });

        p.marker.addTo(map);
      },
      isPlaceFilteredIn(p) {
        if (this.filter_sold != this.filter_unsold) {
          if (this.filter_sold != p.sold)
            return false;
          if (this.filter_unsold != !p.sold)
            return false;
        }

        if (this.filter_constructed != this.filter_in_construction) {
          if (this.filter_constructed != !p.future)
            return false;
          if (this.filter_in_construction != p.future)
            return false;
        }

        if (this.filter_types.length > 0 && !this.filter_types.includes(p.type.abbr))
          return false;

        if (this.filter_surface_min && p.surface && p.surface < this.filter_surface_min)
          return false;
        if (this.filter_surface_max && p.surface && p.surface > this.filter_surface_max)
          return false;

        if (this.filter_price_min && p.price && p.price < this.filter_price_min)
          return false;
        if (this.filter_price_max && p.price && p.price > this.filter_price_max)
          return false;

        if (this.filter_relprice_min && p.price && p.surface && p.relativePrice < this.filter_relprice_min)
          return false;
        if (this.filter_relprice_max && p.price && p.surface && p.relativePrice > this.filter_relprice_max)
          return false;

        return true;
      },
      setSelectedPlace(p, scroll) {
        this.selectedPlace = p;
        if (scroll)
          this.scrollToCurr();
      },
      activateCreation(lat, lon) {
        this.formModel.id = -1;
        this.formModel.lat = lat;
        this.formModel.lon = lon;
        this.mode = 'createPlace';
      },
      activateEdition(p) {
        this.formModel = {
          id: p.id,
          type_id: p.type.id,
          title: p.title,
          surface: p.surface,
          price: p.price,
          description: p.description,
          url: p.url,
          sold: p.sold,
          future: p.future
        };
        this.mode = 'editPlace';
      },
      onAxiosError(err) {
        let data = error.response.data.errors;
        let first = Object.keys(data)[0];
        alert(`Error: ${first} ${data[first]}`);
      },
      afterCreate(response) {
        let p = this.makePlace(response.data);
        this.registerPlace(p);
        this.setSelectedPlace(p, true);
      },
      sendCreateRequest() {
        axios.post(`${baseurl}/places`, JSON.stringify(this.formModel), {headers: {'Accept': 'application/json'}})
             .then(response => this.afterCreate(response), error => this.onAxiosError(error));
      },
      afterUpdate(response) {
        let data = response.data;
        let dest = this.places.find((p) => p.id == data.id);
        if (dest) {
          this.updatePlace(dest, data);
        } else {
          alert("Something wrong happened");
        }
      },
      sendUpdateRequest() {
        axios.put(`${baseurl}/places/${this.formModel.id}`, JSON.stringify(this.formModel), {headers: {'Accept': 'application/json'}})
             .then(response => this.afterUpdate(response), error => this.onAxiosError(error));
      },
      openForm() { this.editModal.show(); },
      discardForm() {
        this.editModal.hide();
        this.formModel = {};
        this.mode = undefined;
      },
      submitForm() {
        if(this.mode == 'createPlace') {
          this.sendCreateRequest();
        } else if (this.mode == 'editPlace') {
          this.sendUpdateRequest();
        }
        this.discardForm();
      },
      toggleDepositMode() {
        this.mode = this.mode == 'depositPlace' ? undefined : 'depositPlace';
      },
      sendRelocationRequest(p, lat, lon) {
        axios.put(`${baseurl}/places/${p.id}`, JSON.stringify({lat, lon}), {headers: {'Accept': 'application/json'}})
             .then(response => {p.lat = response.data.lat; p.lon = response.data.lon; }, error => this.onAxiosError(error))
             .finally(() => p.marker.setLatLng([p.lat, p.lon]));
      },
      toggleMovable() {
        this.mode = (this.mode ==  'editLocation' ? undefined : 'editLocation');
        this.places.forEach(p => this.mode == 'editLocation' ? p.marker.dragging.enable() : p.marker.dragging.disable());
      },
      toggleCompactSidebar() {
        this.sidebarMode = this.sidebarMode == 'sidebar-compact' ? 'sidebar-hidden' : 'sidebar-compact';
      },
      toggleLargeSidebar() {
        this.sidebarMode = this.sidebarMode == 'sidebar-large' ? 'sidebar-hidden' : 'sidebar-large';
      },
      unsorted(key) {
        return this.sortKey != key || this.sortOrder == undefined;
      },
      ascSorted(key) {
        return this.sortKey == key && this.sortOrder == "asc";
      },
      descSorted(key) {
        return this.sortKey == key && this.sortOrder == "desc";
      },
      toggleSort(k) {
        if (this.sortKey != k) {
          this.sortKey = k;
          this.sortOrder = 'asc';
        } else {
          if (this.sortOrder == 'asc')
            this.sortOrder = 'desc';
          else if (this.sortOrder == 'desc')
            this.sortOrder = undefined;
          else
            this.sortOrder = 'asc';
        }
      },
      scrollToCurr() {
        this.$nextTick(_ => document.getElementById('scrollable-place-list').scrollTo(0, document.getElementById(`place${this.selectedPlace.id}`).offsetTop));
      },
      toggleChart() {
        this.headerMode = this.headerMode == 'header-visible' ? 'header-hidden' : 'header-visible';
        if (this.headerMode == 'header-visible') {
          let st = this.stats;
          chart.series[0].setData(st.prices);
          chart.series[1].setData(st.regression);
        }
      },
      applyGlobalSelection(e) {
        let cb = e.target;
        if (cb.indeterminate) {
          this.filteredPlaces.forEach((p) => p.visible = true);
        } else {
          let sel = !this.globalSelection;
          this.filteredPlaces.forEach((p) => p.visible = sel);
        }
      }
    },
    watch: {
      selectedPlace(curr, prev) {
        map.setView([curr.lat, curr.lon]);
      },
      mode(curr, prev) {
        if (prev == 'depositPlace') {
          map.off('click');
        }

        if (curr == 'depositPlace') {
          map.on('click', e => this.activateCreation(e.latlng.lat, e.latlng.lng));
        } else if (curr == 'editPlace' || curr == 'createPlace') {
          this.openForm();
        }
      },
      sidebarMode(curr, prev) {
        document.getElementById("sidebar").classList.replace(prev, curr);
        document.getElementById("header").classList.replace(prev, curr);
        document.getElementById("sidebar-control").classList.replace(prev, curr);
        document.getElementById("map").classList.replace(prev, curr);
      },
      headerMode(curr, prev) {
        document.getElementById("header").classList.replace(prev, curr);
        document.getElementById("sidebar-control").classList.replace(prev, curr);
        document.getElementById("map").classList.replace(prev, curr);
      },
      stats() {
        let st = this.stats;
        chart.series[0].setData(st.prices);
        chart.series[1].setData(st.regression);
      },
      globalSelection(curr, prev) {
        let cb = document.getElementById('master-checkbox');
        cb.indeterminate = (curr == undefined);
        cb.checked = (curr == true);
      }
    },
    mounted() {
      let vm = this;
      let typesq = axios.get(`${baseurl}/placetypes`, {headers: {'Accept': 'application/json'}});
      let placesq = axios.get(`${baseurl}/places`, {headers: {'Accept': 'application/json'}});

      typesq.then(response => {
        vm.place_types = response.data;

        placesq.then(response => {
          response.data.forEach(o => vm.registerPlace(vm.makePlace(o)));
          if (vm.places.length > 0) {
            map.setView([vm.places[0].lat, vm.places[0].lon], 15)
          }
        });
      });

    }
  });

  let placesVM = placesApp.mount('#places-app');

  return placesVM;
}
