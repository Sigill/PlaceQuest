require 'sequel'
require 'json'

DB = Sequel.connect("sqlite://#{File.expand_path "./places.db"}")
DB.run "PRAGMA encoding='UTF-8';"
DB.run "PRAGMA page_size=65536;"
DB.run "PRAGMA journal_mode=WAL;"
#DB.run "PRAGMA locking_mode=EXCLUSIVE;"
DB.run "PRAGMA synchronous = NORMAL;"

DB.create_table?(:places) do
  primary_key :id
  Float :lat, null: false
  Float :lon, null: false
  String :type, size: 32, null: false, default: 'H'
  String :title, null: true, default: ''
  Integer :surface, null: false, default: 0
  Integer :price, null: false, default: 0
  String :description, null: false, text: true, default: ''
  String :url, null: false, text: true, default: ''
  TrueClass :sold, null: false, default: false
  TrueClass :future, null: false, default: false
end

class Place < Sequel::Model
  plugin :validation_helpers
  plugin :json_serializer
  plugin :defaults_setter

  def self.data_columns
    %w{lat lon type title surface price description url sold future}
  end

  def validate
    super
    validates_includes ['H', 'T3', 'T4'], :type
  end


end

Place.columns # load columns
