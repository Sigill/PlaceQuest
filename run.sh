#!/bin/sh

bundle exec ./vendor/bundle/ruby/2.5.0/bin/rerun --pattern "**/*.{rb,js,json,coffee,css,scss,sass,html,haml,ru,yml}" 'rackup config.ru -o 0.0.0.0 -p 4567'
