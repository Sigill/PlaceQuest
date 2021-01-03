#!/usr/bin/ruby
# encoding: UTF-8

require 'rubygems'
require 'sinatra'
require 'sinatra/base'
require 'thin'
require 'json'
require 'tilt/haml'
require_relative 'database'
require 'byebug'

set :server, 'thin'
set :haml, { attr_wrapper: '"' }

class Integer
  def to_b
    !self.zero?
  end
end

module JSONHelper
  def json_body
    request.body.rewind
    return JSON.parse(request.body.read)
  rescue
    halt 400, JSON.generate({message: 'Invalid payload'})
  end
end

class PlacesWebController < Sinatra::Base
  helpers do
    def h(v)
      return nil if v.nil?
      s = v.to_s
      return nil if s.empty?
      return Rack::Utils.escape_html(s)
    end

    def bs_invalid_class(model, field)
      return model.errors[field] ? 'is-invalid' : nil
    end

    def bs_invalid_feedbacks(model, field)
      haml :bs_invalid_feedbacks, locals: {errors: model.errors[field]}
    end
  end

  before do
      @stylesheets = [
        '//cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/css/bootstrap.min.css',
        '//fonts.googleapis.com/icon?family=Material+Icons',
        url('style.css')
      ]
      @scripts = [
        '//cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/js/bootstrap.bundle.min.js'
      ]
  end

  get '/' do
    @stylesheets.insert(-2, url('leaflet/leaflet.css'))

    @scripts << '//code.jquery.com/jquery-3.5.1.slim.min.js'
    @scripts << url('leaflet/leaflet.js')
    @scripts << '//cdn.jsdelivr.net/npm/axios/dist/axios.min.js'
    @scripts << '//unpkg.com/vue@next'
    @scripts << url('app.js')

    haml :map, layout: :main_layout
    # File.read(File.join('views', 'map.html'))
  end

  get '/places', :provides => 'html' do
    haml :places, layout: :main_layout, locals: {places: Place.all}
  end

  post '/places', provides: :html do
    place = Place.new(type: params['type'],
                      title: params['title'],
                      surface: params['surface'],
                      price: params['price'],
                      description: params['description'],
                      url: params['url'],
                      sold: params['sold'].to_b,
                      future: params['future'].to_b
                      )

    if place.valid? then
      place.save
      redirect "/places"
    else
      haml :place_edit, layout: :main_layout, locals: {model: place}
    end
  end

  get '/places/:id', provides: :html do
    halt 400, '<h1>Not a valid ID</h>' unless params['id'] =~ /\d+/

    place = Place[params['id'].to_i]

    halt 404, '<h1>Not found</h>' if place.nil?

    haml :place_view, layout: :main_layout, locals: {model: place}
  end

  get '/places/:id/edit', provides: :html do
    halt 400, '<h1>Not a valid ID</h>' unless params['id'] =~ /\d+/
    place = Place[params['id'].to_i]
    halt 404, '<h1>Unknown id</h1>' if place.nil?
    haml :place_edit, layout: :main_layout, locals: {model: place}
  end

  put '/places/:id/edit', provides: :html do
    halt 400, '<h1>Not a valid ID</h>' unless params['id'] =~ /\d+/
    place = Place[params['id'].to_i]
    halt 404, '<h1>Unknown id</h1>' if place.nil?
    place.set(params.slice(:type, :title, :surface, :price, :description, :url))
    puts params
    if place.valid?
      place.save_changes
      redirect '/places'
    else
      haml :place_edit, layout: :main_layout, locals: {model: place}
    end
  end

  delete '/place/:id', provides: :html do
    haml :create_place, layout: :main_layout, locals: {}
  end
end

class PlacesJSONController < Sinatra::Base
  helpers JSONHelper

  set :show_exceptions, false

  before do
    content_type :json
  end

  def place_from_id_param
    halt 400, JSON.generate({message: 'Invalid ID'}) unless params['id'] =~ /\d+/
    place = Place[params['id'].to_i]
    halt 404, JSON.generate({message: 'Not Found'}) if place.nil?
    return place
  end

  def save_place(place)
    place.save(raise_on_failure: true)
    place.to_json
  rescue
    halt 400, JSON.generate({message: 'Invalid payload', errors: place.errors})
  end

  get '/places', :provides => 'json' do
    Place.all.to_json
  end

  post '/places', provides: :json do
    save_place(Place.new { |p| p.set_fields(json_body(), Place.data_columns) })
  end

  get '/places/:id', provides: :json do
    place_from_id_param().to_json
  end

  put '/places/:id', provides: :json do
    place = place_from_id_param()
    place.set_fields(json_body(), Place.data_columns, missing: :skip)
    save_place(place)
  end

  delete '/places/:id', provides: :json do
    place_from_id_param().destroy
    status 200
  end
end

class App < Sinatra::Base
  use PlacesWebController
  use PlacesJSONController
end