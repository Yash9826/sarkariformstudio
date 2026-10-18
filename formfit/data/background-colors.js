(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  NS.BackgroundColors = Object.freeze([
    Object.freeze({ id: 'white', name: 'White', hex: '#FFFFFF' }),
    Object.freeze({ id: 'offwhite', name: 'Off-white', hex: '#F5F5F5' }),
    Object.freeze({ id: 'lightgrey', name: 'Light grey', hex: '#E6E6E6' }),
    Object.freeze({ id: 'lightblue', name: 'Light blue', hex: '#DCEBFA' }),
    Object.freeze({ id: 'skyblue', name: 'Sky blue', hex: '#8EC5FC' }),
    Object.freeze({ id: 'studioblue', name: 'Studio blue', hex: '#2F6FED' }),
    Object.freeze({ id: 'red', name: 'Red', hex: '#D32F2F' }),
    Object.freeze({ id: 'green', name: 'Green', hex: '#2E7D32' }),
    Object.freeze({ id: 'black', name: 'Black', hex: '#000000' }),
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
