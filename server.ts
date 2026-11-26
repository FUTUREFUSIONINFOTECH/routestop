import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import type {
  PlatformState,
  RouteStop,
  Trip,
  TripStopEta,
  Order,
  OrderStatus,
  Restaurant,
  TransportCompany,
  Vehicle,
  HighwayRoute,
  Partnership,
  QRCodeRecord,
  PlatformNotification,
  AuditLog,
  Settlement,
} from './src/types/platform.ts';

const IMG_HERO = '/src/assets/images/highway_plaza_hero_1795667339325.jpg';
const IMG_DOSA = '/src/assets/images/masala_dosa_platter_1795667339414.jpg';
const IMG_BIRYANI = '/src/assets/images/hyderabadi_biryani_pot_1795667339711.jpg';
const IMG_COFFEE = '/src/assets/images/filter_coffee_snacks_1795667340074.jpg';
const IMG_THALI = '/src/assets/images/thali_meal_tray_1795667340245.jpg';

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function interpolateRoutePosition(stops: RouteStop[], progressPct: number) {
  const clamped = Math.max(0, Math.min(100, progressPct));
  const totalKm = stops[stops.length - 1]?.kmFromOrigin || 1;
  const currentKm = Number(((clamped / 100) * totalKm).toFixed(1));

  let prev = stops[0];
  let next = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (currentKm >= stops[i].kmFromOrigin && currentKm <= stops[i + 1].kmFromOrigin) {
      prev = stops[i];
      next = stops[i + 1];
      break;
    }
  }

  const segSpan = Math.max(0.1, next.kmFromOrigin - prev.kmFromOrigin);
  const segRatio = Math.max(0, Math.min(1, (currentKm - prev.kmFromOrigin) / segSpan));
  const lat = Number((prev.lat + (next.lat - prev.lat) * segRatio).toFixed(5));
  const lng = Number((prev.lng + (next.lng - prev.lng) * segRatio).toFixed(5));

  const dLon = ((next.lng - prev.lng) * Math.PI) / 180;
  const lat1 = (prev.lat * Math.PI) / 180;
  const lat2 = (next.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const headingDeg = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);

  return { currentKm, lat, lng, headingDeg };
}

function computeStopEtas(stops: RouteStop[], currentKm: number, speedKmh: number): TripStopEta[] {
  const effectiveSpeed = Math.max(35, speedKmh || 65);
  return stops.map((stop) => {
    const remaining = Math.max(0, Number((stop.kmFromOrigin - currentKm).toFixed(1)));
    const passed = currentKm > stop.kmFromOrigin + 1.2;
    const etaMinutes = passed ? 0 : Math.max(1, Math.round((remaining / effectiveSpeed) * 60));
    return {
      stopId: stop.id,
      stopName: stop.name,
      restaurantId: stop.restaurantId,
      kmFromOrigin: stop.kmFromOrigin,
      distanceRemainingKm: remaining,
      etaMinutes,
      passed,
    };
  });
}

function createInitialState(): PlatformState {
  const routes: HighwayRoute[] = [
    {
      id: 'route-chm',
      name: 'Chennai → Madurai (NH-45)',
      code: 'NH45-CHM',
      origin: 'Chennai Koyambedu',
      destination: 'Madurai Mattuthavani',
      totalKm: 462,
      stops: [
        {
          id: 'stop-chm-0',
          name: 'Chennai Koyambedu Terminus',
          kmFromOrigin: 0,
          lat: 13.0694,
          lng: 80.1948,
          expectedArrivalWindow: '20:30 Dep',
        },
        {
          id: 'stop-chm-1',
          name: 'Villupuram Bypass Plaza',
          kmFromOrigin: 162,
          lat: 11.9401,
          lng: 79.4861,
          expectedArrivalWindow: '22:55 – 23:15',
          restaurantId: 'rest-a2b',
        },
        {
          id: 'stop-chm-2',
          name: 'Trichy Toll Food Court',
          kmFromOrigin: 322,
          lat: 10.7905,
          lng: 78.7047,
          expectedArrivalWindow: '01:20 – 01:40',
          restaurantId: 'rest-annapoorna',
        },
        {
          id: 'stop-chm-3',
          name: 'Madurai Ring Road Hub',
          kmFromOrigin: 448,
          lat: 9.9552,
          lng: 78.1498,
          expectedArrivalWindow: '03:25 – 03:40',
          restaurantId: 'rest-chola',
        },
        {
          id: 'stop-chm-4',
          name: 'Madurai Mattuthavani Terminus',
          kmFromOrigin: 462,
          lat: 9.9391,
          lng: 78.1578,
          expectedArrivalWindow: '03:55 Arr',
        },
      ],
    },
    {
      id: 'route-bls',
      name: 'Bengaluru → Salem (NH-44)',
      code: 'NH44-BLS',
      origin: 'Bengaluru Silk Board',
      destination: 'Salem New Terminus',
      totalKm: 205,
      stops: [
        {
          id: 'stop-bls-0',
          name: 'Bengaluru Silk Board Bay',
          kmFromOrigin: 0,
          lat: 12.9177,
          lng: 77.6238,
          expectedArrivalWindow: '21:15 Dep',
        },
        {
          id: 'stop-bls-1',
          name: 'Hosur Highway Courtyard',
          kmFromOrigin: 42,
          lat: 12.7409,
          lng: 77.8253,
          expectedArrivalWindow: '22:05 – 22:20',
          restaurantId: 'rest-kaveri',
        },
        {
          id: 'stop-bls-2',
          name: 'Krishnagiri Junction Inn',
          kmFromOrigin: 94,
          lat: 12.5186,
          lng: 78.2137,
          expectedArrivalWindow: '22:55 – 23:15',
          restaurantId: 'rest-saravana',
        },
        {
          id: 'stop-bls-3',
          name: 'Salem New Bus Terminus',
          kmFromOrigin: 205,
          lat: 11.6643,
          lng: 78.146,
          expectedArrivalWindow: '00:45 Arr',
        },
      ],
    },
  ];

  const restaurants: Restaurant[] = [
    {
      id: 'rest-a2b',
      name: 'A2B Highway Plaza',
      ownerName: 'Venkatesh Iyer',
      mobile: '+91 98401 22410',
      email: 'ops@a2bplaza.in',
      address: 'NH-45 Bypass, Janakipuram, Villupuram',
      city: 'Villupuram',
      lat: 11.9401,
      lng: 79.4861,
      operatingHours: '05:30 AM – 02:30 AM',
      status: 'APPROVED',
      acceptingOrders: true,
      commissionPct: 5,
      gstNumber: '33AAACA4821M1Z5',
      fssaiNumber: '12422019000482',
      bankAccount: 'HDFC •••• 8921 (IFSC: HDFC0001042)',
      branches: ['Villupuram NH-45 Plaza', 'Tindivanam Express Bay'],
      heroImage: IMG_HERO,
      rating: 4.8,
      avgPrepMinutes: 12,
      createdAt: '2026-09-12T08:00:00.000Z',
    },
    {
      id: 'rest-annapoorna',
      name: 'Temple City Annapoorna',
      ownerName: 'Meenakshi Sundaram',
      mobile: '+91 94431 77820',
      email: 'kitchen@templecityfoods.in',
      address: 'Samayapuram Toll Plaza, NH-45, Tiruchirappalli',
      city: 'Tiruchirappalli',
      lat: 10.7905,
      lng: 78.7047,
      operatingHours: '24 Hours Highway Service',
      status: 'APPROVED',
      acceptingOrders: true,
      commissionPct: 6,
      gstNumber: '33AABCT9021K1Z8',
      fssaiNumber: '12421024001109',
      bankAccount: 'ICICI •••• 4410 (IFSC: ICIC0000412)',
      branches: ['Trichy Toll Plaza', 'Dindigul Bypass'],
      heroImage: IMG_THALI,
      rating: 4.7,
      avgPrepMinutes: 15,
      createdAt: '2026-09-18T10:30:00.000Z',
    },
    {
      id: 'rest-chola',
      name: 'Grand Chola Kitchen',
      ownerName: 'Senthil Nathan',
      mobile: '+91 98940 55102',
      email: 'desk@grandcholakitchen.com',
      address: 'Ring Road Transit Hub, Othakadai, Madurai',
      city: 'Madurai',
      lat: 9.9552,
      lng: 78.1498,
      operatingHours: '06:00 AM – 04:00 AM',
      status: 'APPROVED',
      acceptingOrders: true,
      commissionPct: 5,
      gstNumber: '33AADCG1904P1Z2',
      fssaiNumber: '12423011002941',
      bankAccount: 'SBI •••• 7732 (IFSC: SBIN0004810)',
      branches: ['Madurai Ring Road'],
      heroImage: IMG_BIRYANI,
      rating: 4.9,
      avgPrepMinutes: 14,
      createdAt: '2026-10-02T09:15:00.000Z',
    },
    {
      id: 'rest-kaveri',
      name: 'Kaveri Spice Courtyard',
      ownerName: 'Prakash Rao',
      mobile: '+91 99001 31209',
      email: 'partner@kaverispice.in',
      address: 'SIPCO Highway Plaza, NH-44, Hosur',
      city: 'Hosur',
      lat: 12.7409,
      lng: 77.8253,
      operatingHours: '05:00 AM – 01:30 AM',
      status: 'APPROVED',
      acceptingOrders: true,
      commissionPct: 5,
      gstNumber: '33AAACK6621N1Z4',
      fssaiNumber: '12422008005519',
      bankAccount: 'AXIS •••• 3104 (IFSC: UTIB0000219)',
      branches: ['Hosur NH-44 Bay'],
      heroImage: IMG_DOSA,
      rating: 4.6,
      avgPrepMinutes: 10,
      createdAt: '2026-10-14T11:00:00.000Z',
    },
    {
      id: 'rest-saravana',
      name: 'Saravana Highway Inn',
      ownerName: 'Balaji Murugan',
      mobile: '+91 97890 11234',
      email: 'admin@saravanahighway.in',
      address: 'Toll Gate East, NH-44, Krishnagiri',
      city: 'Krishnagiri',
      lat: 12.5186,
      lng: 78.2137,
      operatingHours: '06:00 AM – 12:30 AM',
      status: 'PENDING',
      acceptingOrders: false,
      commissionPct: 5,
      gstNumber: '33AAACS7120Q1Z9',
      fssaiNumber: '12424005008122',
      bankAccount: 'KOTAK •••• 6019 (IFSC: KKBK0000481)',
      branches: ['Krishnagiri Junction'],
      heroImage: IMG_COFFEE,
      rating: 4.5,
      avgPrepMinutes: 12,
      createdAt: '2026-11-24T14:20:00.000Z',
    },
  ];

  const menuItems = [
    {
      id: 'item-1',
      restaurantId: 'rest-a2b',
      category: 'South Indian Classics',
      name: 'Ghee Roast Masala Dosa',
      description: 'Crisp fermented crepe roasted in pure cow ghee with spiced potato masala, sambar & 3 chutneys.',
      price: 165,
      isVeg: true,
      available: true,
      image: IMG_DOSA,
      prepMinutes: 8,
    },
    {
      id: 'item-2',
      restaurantId: 'rest-a2b',
      category: 'Beverages & Quick Bites',
      name: 'Kumbakonam Filter Coffee & Medu Vada',
      description: 'Brass davara filter coffee paired with two crisp lentil vadas and coconut chutney.',
      price: 110,
      isVeg: true,
      available: true,
      image: IMG_COFFEE,
      prepMinutes: 5,
    },
    {
      id: 'item-3',
      restaurantId: 'rest-a2b',
      category: 'Executive Meals',
      name: 'Highway Executive Veg Thali',
      description: '2 Butter Naan, Paneer Butter Masala, Dal Tadka, Jeera Rice, fresh salad & warm Gulab Jamun.',
      price: 260,
      isVeg: true,
      available: true,
      image: IMG_THALI,
      prepMinutes: 12,
    },
    {
      id: 'item-4',
      restaurantId: 'rest-a2b',
      category: 'South Indian Classics',
      name: 'Mini Tiffin Express Pack',
      description: '2 Idli, 1 Mini Pongal, 1 Vada, Kesari bath & sambar packed spill-proof for seat dining.',
      price: 185,
      isVeg: true,
      available: true,
      image: IMG_DOSA,
      prepMinutes: 7,
    },
    {
      id: 'item-5',
      restaurantId: 'rest-annapoorna',
      category: 'Executive Meals',
      name: 'Temple City Grand Veg Meal',
      description: 'Full South Indian highway feast with phulkas, paneer gravy, dal, jeera pulao & sweet.',
      price: 240,
      isVeg: true,
      available: true,
      image: IMG_THALI,
      prepMinutes: 12,
    },
    {
      id: 'item-6',
      restaurantId: 'rest-annapoorna',
      category: 'Rice & Biryani',
      name: 'Saffron Subz Dum Biryani',
      description: 'Long-grain basmati rice slow-cooked with seasonal vegetables, mint & roasted cashews.',
      price: 220,
      isVeg: true,
      available: true,
      image: IMG_BIRYANI,
      prepMinutes: 10,
    },
    {
      id: 'item-7',
      restaurantId: 'rest-annapoorna',
      category: 'Beverages & Quick Bites',
      name: 'Madras Degree Coffee Flask (250ml)',
      description: 'Insulated travel flask of freshly brewed chicory-blend filter coffee.',
      price: 95,
      isVeg: true,
      available: true,
      image: IMG_COFFEE,
      prepMinutes: 4,
    },
    {
      id: 'item-8',
      restaurantId: 'rest-chola',
      category: 'Rice & Biryani',
      name: 'Madurai Royal Chicken Dum Biryani',
      description: 'Seeraga samba & saffron basmati layered with tender spiced chicken, egg & onion raita.',
      price: 310,
      isVeg: false,
      available: true,
      image: IMG_BIRYANI,
      prepMinutes: 14,
    },
    {
      id: 'item-9',
      restaurantId: 'rest-chola',
      category: 'South Indian Classics',
      name: 'Madurai Kari Dosa & Salna',
      description: 'Three-layered minced spiced mutton dosa served piping hot with Chettinad salna.',
      price: 275,
      isVeg: false,
      available: true,
      image: IMG_DOSA,
      prepMinutes: 12,
    },
    {
      id: 'item-10',
      restaurantId: 'rest-chola',
      category: 'Executive Meals',
      name: 'Chola North-South Combo Thali',
      description: 'Tandoori roti, paneer butter masala, dal fry, steamed rice & gulab jamun.',
      price: 250,
      isVeg: true,
      available: true,
      image: IMG_THALI,
      prepMinutes: 11,
    },
    {
      id: 'item-11',
      restaurantId: 'rest-kaveri',
      category: 'South Indian Classics',
      name: 'Mysore Ghee Masala Dosa',
      description: 'Crisp dosa coated with red garlic chutney and potato palya.',
      price: 155,
      isVeg: true,
      available: true,
      image: IMG_DOSA,
      prepMinutes: 8,
    },
    {
      id: 'item-12',
      restaurantId: 'rest-kaveri',
      category: 'Beverages & Quick Bites',
      name: 'Filter Coffee & Crispy Vada Duo',
      description: 'Freshly brewed brass tumbler coffee with two hot medu vadas.',
      price: 105,
      isVeg: true,
      available: true,
      image: IMG_COFFEE,
      prepMinutes: 5,
    },
    {
      id: 'item-13',
      restaurantId: 'rest-kaveri',
      category: 'Rice & Biryani',
      name: 'Donne Chicken Pepper Biryani',
      description: 'Traditional Karnataka green-herb biryani with roasted pepper chicken & raita.',
      price: 290,
      isVeg: false,
      available: true,
      image: IMG_BIRYANI,
      prepMinutes: 13,
    },
    {
      id: 'item-14',
      restaurantId: 'rest-saravana',
      category: 'Beverages & Quick Bites',
      name: 'Highway Special Filter Coffee',
      description: 'Classic South Indian brew served hot.',
      price: 60,
      isVeg: true,
      available: true,
      image: IMG_COFFEE,
      prepMinutes: 4,
    },
  ];

  const companies: TransportCompany[] = [
    {
      id: 'comp-kpn',
      name: 'KPN Travels & Logistics',
      ownerName: 'K.P. Natarajan',
      mobile: '+91 98422 90100',
      email: 'fleet@kpntravels.in',
      registrationNo: 'TN-45-TR-88210',
      status: 'APPROVED',
      documentRef: 'RC-FLEET-2026-KPN.pdf',
      createdAt: '2026-09-01T08:00:00.000Z',
    },
    {
      id: 'comp-srs',
      name: 'SRS Luxury Coaches',
      ownerName: 'R. Shrinivas',
      mobile: '+91 98450 44120',
      email: 'dispatch@srstravels.in',
      registrationNo: 'KA-01-TR-44902',
      status: 'APPROVED',
      documentRef: 'RC-FLEET-2026-SRS.pdf',
      createdAt: '2026-09-10T09:30:00.000Z',
    },
    {
      id: 'comp-parveen',
      name: 'Parveen Express Lines',
      ownerName: 'A. Sadiq Ali',
      mobile: '+91 98400 71200',
      email: 'admin@parveenexpress.in',
      registrationNo: 'TN-09-TR-10294',
      status: 'PENDING',
      documentRef: 'RC-FLEET-2026-PRV.pdf',
      createdAt: '2026-11-23T16:45:00.000Z',
    },
  ];

  const staff = [
    {
      id: 'drv-1',
      name: 'Karthik Raja',
      mobile: '+91 98402 33101',
      licenseNo: 'TN45-20160049102',
      companyId: 'comp-kpn',
      role: 'DRIVER' as const,
      assignedVehicleId: 'veh-tn45',
    },
    {
      id: 'cnd-1',
      name: 'Suresh Babu',
      mobile: '+91 98402 33102',
      licenseNo: 'CND-TN45-8821',
      companyId: 'comp-kpn',
      role: 'CONDUCTOR' as const,
      assignedVehicleId: 'veh-tn45',
    },
    {
      id: 'drv-2',
      name: 'Arjun Gowda',
      mobile: '+91 98451 66702',
      licenseNo: 'KA01-20180091234',
      companyId: 'comp-srs',
      role: 'DRIVER' as const,
      assignedVehicleId: 'veh-ka01',
    },
    {
      id: 'cnd-2',
      name: 'Mani V',
      mobile: '+91 98451 66703',
      licenseNo: 'CND-KA01-4102',
      companyId: 'comp-srs',
      role: 'CONDUCTOR' as const,
      assignedVehicleId: 'veh-ka01',
    },
    {
      id: 'drv-3',
      name: 'Ravi Shankar',
      mobile: '+91 98409 12004',
      licenseNo: 'TN09-20190011220',
      companyId: 'comp-kpn',
      role: 'DRIVER' as const,
      assignedVehicleId: 'veh-tn09',
    },
    {
      id: 'cnd-3',
      name: 'Kumar P',
      mobile: '+91 98409 12005',
      licenseNo: 'CND-TN09-7710',
      companyId: 'comp-kpn',
      role: 'CONDUCTOR' as const,
      assignedVehicleId: 'veh-tn09',
    },
  ];

  const vehicles: Vehicle[] = [
    {
      id: 'veh-tn45',
      companyId: 'comp-kpn',
      regNumber: 'TN 45 AB 1234',
      type: 'AC Sleeper',
      seatingCapacity: 36,
      routeId: 'route-chm',
      driverId: 'drv-1',
      conductorId: 'cnd-1',
      status: 'ACTIVE',
    },
    {
      id: 'veh-ka01',
      companyId: 'comp-srs',
      regNumber: 'KA 01 F 8821',
      type: 'Volvo Multi-Axle',
      seatingCapacity: 44,
      routeId: 'route-bls',
      driverId: 'drv-2',
      conductorId: 'cnd-2',
      status: 'ACTIVE',
    },
    {
      id: 'veh-tn09',
      companyId: 'comp-kpn',
      regNumber: 'TN 09 CK 4092',
      type: 'Luxury Seater',
      seatingCapacity: 40,
      routeId: 'route-chm',
      driverId: 'drv-3',
      conductorId: 'cnd-3',
      status: 'ACTIVE',
    },
  ];

  const partnerships: Partnership[] = [
    {
      id: 'part-1',
      companyId: 'comp-kpn',
      vehicleId: 'veh-tn45',
      routeId: 'route-chm',
      restaurantIds: ['rest-a2b', 'rest-annapoorna', 'rest-chola'],
      startDate: '2026-10-01',
      endDate: '2027-09-30',
      status: 'APPROVED',
      createdAt: '2026-10-01T08:00:00.000Z',
    },
    {
      id: 'part-2',
      companyId: 'comp-srs',
      vehicleId: 'veh-ka01',
      routeId: 'route-bls',
      restaurantIds: ['rest-kaveri'],
      startDate: '2026-10-15',
      endDate: '2027-10-14',
      status: 'APPROVED',
      createdAt: '2026-10-15T10:00:00.000Z',
    },
    {
      id: 'part-3',
      companyId: 'comp-kpn',
      vehicleId: 'veh-tn09',
      routeId: 'route-chm',
      restaurantIds: ['rest-a2b', 'rest-annapoorna'],
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      status: 'APPROVED',
      createdAt: '2026-11-01T09:00:00.000Z',
    },
  ];

  const qrCodes: QRCodeRecord[] = [
    {
      id: 'qr-1',
      token: 'RS-TN45-CHM-01',
      partnershipId: 'part-1',
      vehicleId: 'veh-tn45',
      routeId: 'route-chm',
      active: true,
      scanCount: 48,
      orderCount: 4,
      createdAt: '2026-10-01T08:05:00.000Z',
    },
    {
      id: 'qr-2',
      token: 'RS-KA01-BLS-02',
      partnershipId: 'part-2',
      vehicleId: 'veh-ka01',
      routeId: 'route-bls',
      active: true,
      scanCount: 19,
      orderCount: 1,
      createdAt: '2026-10-15T10:10:00.000Z',
    },
    {
      id: 'qr-3',
      token: 'RS-TN09-CHM-03',
      partnershipId: 'part-3',
      vehicleId: 'veh-tn09',
      routeId: 'route-chm',
      active: true,
      scanCount: 12,
      orderCount: 0,
      createdAt: '2026-11-01T09:15:00.000Z',
    },
  ];

  const pos1 = interpolateRoutePosition(routes[0].stops, 31);
  const pos2 = interpolateRoutePosition(routes[1].stops, 0);
  const pos3 = interpolateRoutePosition(routes[0].stops, 0);

  const trips: Trip[] = [
    {
      id: 'trip-1',
      vehicleId: 'veh-tn45',
      routeId: 'route-chm',
      driverId: 'drv-1',
      conductorId: 'cnd-1',
      status: 'IN_PROGRESS',
      progressPct: 31,
      currentKm: pos1.currentKm,
      currentLat: pos1.lat,
      currentLng: pos1.lng,
      speedKmh: 68,
      headingDeg: pos1.headingDeg,
      stopEtas: computeStopEtas(routes[0].stops, pos1.currentKm, 68),
      startedAt: new Date(Date.now() - 1000 * 60 * 125).toISOString(),
      lastUpdatedAt: nowIso(),
    },
    {
      id: 'trip-2',
      vehicleId: 'veh-ka01',
      routeId: 'route-bls',
      driverId: 'drv-2',
      conductorId: 'cnd-2',
      status: 'READY_TO_START',
      progressPct: 0,
      currentKm: pos2.currentKm,
      currentLat: pos2.lat,
      currentLng: pos2.lng,
      speedKmh: 0,
      headingDeg: pos2.headingDeg,
      stopEtas: computeStopEtas(routes[1].stops, pos2.currentKm, 64),
      lastUpdatedAt: nowIso(),
    },
    {
      id: 'trip-3',
      vehicleId: 'veh-tn09',
      routeId: 'route-chm',
      driverId: 'drv-3',
      conductorId: 'cnd-3',
      status: 'ASSIGNED',
      progressPct: 0,
      currentKm: pos3.currentKm,
      currentLat: pos3.lat,
      currentLng: pos3.lng,
      speedKmh: 0,
      headingDeg: pos3.headingDeg,
      stopEtas: computeStopEtas(routes[0].stops, pos3.currentKm, 65),
      lastUpdatedAt: nowIso(),
    },
  ];

  const orders: Order[] = [
    {
      id: 'ORD-8841',
      pickupCode: '4821',
      idempotencyKey: 'seed-8841',
      qrId: 'qr-1',
      vehicleId: 'veh-tn45',
      companyId: 'comp-kpn',
      routeId: 'route-chm',
      tripId: 'trip-1',
      restaurantId: 'rest-a2b',
      items: [
        { menuItemId: 'item-1', name: 'Ghee Roast Masala Dosa', qty: 2, unitPrice: 165, isVeg: true },
        { menuItemId: 'item-2', name: 'Kumbakonam Filter Coffee & Medu Vada', qty: 1, unitPrice: 110, isVeg: true },
      ],
      subtotal: 440,
      gstAmount: 22,
      serviceFee: 10,
      totalAmount: 472,
      commissionPct: 5,
      platformCommission: 22,
      gatewayFee: 8.5,
      restaurantPayable: 409.5,
      orderType: 'DINE_IN',
      dineInGuests: 2,
      passengerName: 'Ananya Krishnan',
      passengerPhone: '+91 98405 11220',
      seatNumber: 'U4 / Sleeper',
      specialInstructions: 'Less spicy sambar please',
      paymentStatus: 'VERIFIED',
      paymentRef: 'PAY-RZP-992014',
      status: 'PREPARING',
      etaMinutesAtOrder: 24,
      distanceKmAtOrder: 27.2,
      createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    },
    {
      id: 'ORD-8842',
      pickupCode: '7194',
      idempotencyKey: 'seed-8842',
      qrId: 'qr-1',
      vehicleId: 'veh-tn45',
      companyId: 'comp-kpn',
      routeId: 'route-chm',
      tripId: 'trip-1',
      restaurantId: 'rest-a2b',
      items: [
        { menuItemId: 'item-3', name: 'Highway Executive Veg Thali', qty: 1, unitPrice: 260, isVeg: true },
      ],
      subtotal: 260,
      gstAmount: 13,
      serviceFee: 10,
      totalAmount: 283,
      commissionPct: 5,
      platformCommission: 13,
      gatewayFee: 5.1,
      restaurantPayable: 241.9,
      orderType: 'TAKEAWAY',
      passengerName: 'Vikramaditya S',
      passengerPhone: '+91 99401 88721',
      seatNumber: 'L7',
      dietaryNotes: 'No onion in dal if possible',
      paymentStatus: 'VERIFIED',
      paymentRef: 'PAY-RZP-992089',
      status: 'NEW',
      etaMinutesAtOrder: 17,
      distanceKmAtOrder: 18.8,
      createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    },
    {
      id: 'ORD-8843',
      pickupCode: '3056',
      idempotencyKey: 'seed-8843',
      qrId: 'qr-1',
      vehicleId: 'veh-tn45',
      companyId: 'comp-kpn',
      routeId: 'route-chm',
      tripId: 'trip-1',
      restaurantId: 'rest-annapoorna',
      items: [
        { menuItemId: 'item-6', name: 'Saffron Subz Dum Biryani', qty: 2, unitPrice: 220, isVeg: true },
        { menuItemId: 'item-7', name: 'Madras Degree Coffee Flask (250ml)', qty: 1, unitPrice: 95, isVeg: true },
      ],
      subtotal: 535,
      gstAmount: 26.75,
      serviceFee: 10,
      totalAmount: 571.75,
      commissionPct: 6,
      platformCommission: 32.1,
      gatewayFee: 10.29,
      restaurantPayable: 492.61,
      orderType: 'TAKEAWAY',
      passengerName: 'Deepak Narayanan',
      passengerPhone: '+91 97908 44123',
      seatNumber: 'U11',
      paymentStatus: 'VERIFIED',
      paymentRef: 'PAY-RZP-992102',
      status: 'ACCEPTED',
      etaMinutesAtOrder: 158,
      distanceKmAtOrder: 178.8,
      createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
    },
    {
      id: 'ORD-8839',
      pickupCode: '1182',
      idempotencyKey: 'seed-8839',
      qrId: 'qr-1',
      vehicleId: 'veh-tn45',
      companyId: 'comp-kpn',
      routeId: 'route-chm',
      tripId: 'trip-1',
      restaurantId: 'rest-a2b',
      items: [
        { menuItemId: 'item-4', name: 'Mini Tiffin Express Pack', qty: 2, unitPrice: 185, isVeg: true },
      ],
      subtotal: 370,
      gstAmount: 18.5,
      serviceFee: 10,
      totalAmount: 398.5,
      commissionPct: 5,
      platformCommission: 18.5,
      gatewayFee: 7.17,
      restaurantPayable: 344.33,
      orderType: 'TAKEAWAY',
      passengerName: 'Priya Dharshini',
      passengerPhone: '+91 98412 90876',
      seatNumber: 'L2',
      paymentStatus: 'VERIFIED',
      paymentRef: 'PAY-RZP-991940',
      status: 'COMPLETED',
      etaMinutesAtOrder: 12,
      distanceKmAtOrder: 14.0,
      createdAt: new Date(Date.now() - 1000 * 60 * 65).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    },
  ];

  const settlements: Settlement[] = [
    {
      id: 'STL-2026-101',
      restaurantId: 'rest-a2b',
      orderIds: ['ORD-8839'],
      grossAmount: 370,
      commissionAmount: 18.5,
      gatewayFeeTotal: 7.17,
      gstOnFees: 3.33,
      netPayable: 341.0,
      status: 'SETTLED',
      settledAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      utrRef: 'HDFCR520261125984102',
    },
  ];

  const notifications: PlatformNotification[] = [
    {
      id: 'ntf-1',
      targetRole: 'RESTAURANT',
      targetId: 'rest-a2b',
      title: 'New Paid Order · ORD-8842',
      message: 'Passenger Vikramaditya S (TN 45 AB 1234 · Seat L7) ordered Highway Executive Veg Thali (Takeaway).',
      type: 'ORDER',
      read: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    },
    {
      id: 'ntf-2',
      targetRole: 'RESTAURANT',
      targetId: 'rest-a2b',
      title: 'Bus Approaching · TN 45 AB 1234',
      message: 'KPN Travels AC Sleeper is 18.8 km away (ETA 17 mins). 2 active pre-orders queued.',
      type: 'ETA',
      read: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    },
    {
      id: 'ntf-3',
      targetRole: 'SUPER_ADMIN',
      title: 'Pending Partner Registration',
      message: 'Saravana Highway Inn (Krishnagiri) and Parveen Express Lines awaiting verification.',
      type: 'SYSTEM',
      read: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'aud-1',
      actorRole: 'DRIVER',
      action: 'TRIP_STARTED',
      entityId: 'trip-1',
      details: 'Driver Karthik Raja started TN 45 AB 1234 on Chennai → Madurai (NH-45)',
      timestamp: new Date(Date.now() - 1000 * 60 * 125).toISOString(),
    },
    {
      id: 'aud-2',
      actorRole: 'SYSTEM',
      action: 'PAYMENT_VERIFIED',
      entityId: 'ORD-8842',
      details: 'Backend signature verified for PAY-RZP-992089 (₹283.00)',
      timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    },
  ];

  return {
    restaurants,
    menuItems,
    companies,
    staff,
    vehicles,
    routes,
    partnerships,
    qrCodes,
    trips,
    orders,
    settlements,
    notifications,
    auditLogs,
  };
}

let state: PlatformState = createInitialState();

function addAudit(actorRole: string, action: string, entityId: string, details: string) {
  state.auditLogs.unshift({
    id: makeId('AUD'),
    actorRole,
    action,
    entityId,
    details,
    timestamp: nowIso(),
  });
  if (state.auditLogs.length > 80) state.auditLogs.length = 80;
}

function addNotification(
  targetRole: PlatformNotification['targetRole'],
  title: string,
  message: string,
  type: PlatformNotification['type'],
  targetId?: string
) {
  state.notifications.unshift({
    id: makeId('NTF'),
    targetRole,
    targetId,
    title,
    message,
    type,
    read: false,
    createdAt: nowIso(),
  });
  if (state.notifications.length > 60) state.notifications.length = 60;
}

async function startServer() {
  const app = express();

  // GitHub Pages frontend -> Render API.
  // Set CORS_ORIGINS in Render to a comma-separated list of allowed origins.
  // Example: https://futurefusioninfotech.github.io
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS || 'https://futurefusioninfotech.github.io')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );

  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;

    if (requestOrigin && allowedOrigins.has(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || 'Content-Type, Authorization'
    );

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Render health check endpoint.
  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'routestop-api',
      timestamp: nowIso(),
    });
  });

  // Simple root response so the Render service URL is not a blank page.
  app.get('/', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'RouteStop API',
      health: '/health',
      state: '/api/state',
      websocket: '/ws',
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcastState = (eventType = 'state:update') => {
    const payload = JSON.stringify({ type: eventType, data: state });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  };

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'state:init', data: state }));
  });

  // Health & State Snapshot
  app.get('/api/state', (_req, res) => {
    res.json(state);
  });

  // Reset Demo Data
  app.post('/api/reset-demo', (_req, res) => {
    state = createInitialState();
    broadcastState('state:reset');
    res.json({ ok: true, state });
  });

  // Dynamic QR SVG & PNG Generator
  app.get('/api/qr/:token/svg', async (req, res) => {
    const { token } = req.params;
    const baseUrl =
      (req.query.origin as string) ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const targetUrl = `${baseUrl.replace(/\/$/, '')}/?view=passenger&qr=${encodeURIComponent(token)}`;
    try {
      const svg = await QRCode.toString(targetUrl, {
        type: 'svg',
        margin: 1,
        width: 240,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg);
    } catch {
      res.status(500).json({ error: 'Failed to generate QR SVG' });
    }
  });

  app.get('/api/qr/:token/png', async (req, res) => {
    const { token } = req.params;
    const baseUrl =
      (req.query.origin as string) ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const targetUrl = `${baseUrl.replace(/\/$/, '')}/?view=passenger&qr=${encodeURIComponent(token)}`;
    try {
      const buffer = await QRCode.toBuffer(targetUrl, {
        type: 'png',
        margin: 2,
        width: 512,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${token}.png"`);
      res.send(buffer);
    } catch {
      res.status(500).json({ error: 'Failed to generate QR PNG' });
    }
  });

  // QR Scan Tracking & Validation
  app.post('/api/qr/scan', (req, res) => {
    const { token } = req.body as { token?: string };
    const qr = state.qrCodes.find((q) => q.token === token);
    if (!qr || !qr.active) {
      return res.status(404).json({ error: 'QR code is invalid or deactivated.' });
    }
    const partnership = state.partnerships.find((p) => p.id === qr.partnershipId);
    if (!partnership || partnership.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Route partnership is currently inactive.' });
    }
    const company = state.companies.find((c) => c.id === partnership.companyId);
    if (!company || company.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Transport company access is suspended.' });
    }
    qr.scanCount += 1;
    broadcastState();
    res.json({ ok: true, qr, partnership });
  });

  // Passenger Order Creation (Idempotent + Backend Price & Availability Verification)
  app.post('/api/orders', (req, res) => {
    const {
      idempotencyKey,
      qrId,
      restaurantId,
      items,
      orderType,
      dineInGuests,
      passengerName,
      passengerPhone,
      seatNumber,
      specialInstructions,
      dietaryNotes,
      simulateOutcome = 'SUCCESS',
    } = req.body as {
      idempotencyKey: string;
      qrId: string;
      restaurantId: string;
      items: { menuItemId: string; qty: number }[];
      orderType: 'DINE_IN' | 'TAKEAWAY';
      dineInGuests?: number;
      passengerName: string;
      passengerPhone: string;
      seatNumber?: string;
      specialInstructions?: string;
      dietaryNotes?: string;
      simulateOutcome?: 'SUCCESS' | 'FAIL';
    };

    if (!idempotencyKey || !qrId || !restaurantId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order fields.' });
    }

    // Idempotency guard
    const existing = state.orders.find((o) => o.idempotencyKey === idempotencyKey);
    if (existing) {
      return res.json({ ok: true, order: existing, idempotentHit: true });
    }

    const qr = state.qrCodes.find((q) => q.id === qrId && q.active);
    if (!qr) return res.status(403).json({ error: 'Active bus QR verification failed.' });

    const partnership = state.partnerships.find((p) => p.id === qr.partnershipId && p.status === 'APPROVED');
    if (!partnership || !partnership.restaurantIds.includes(restaurantId)) {
      return res.status(403).json({ error: 'Restaurant is not an approved partner on this bus route.' });
    }

    const company = state.companies.find((c) => c.id === partnership.companyId && c.status === 'APPROVED');
    if (!company) return res.status(403).json({ error: 'Transport company is not approved.' });

    const restaurant = state.restaurants.find((r) => r.id === restaurantId);
    if (!restaurant || restaurant.status !== 'APPROVED' || !restaurant.acceptingOrders) {
      return res.status(409).json({ error: 'Restaurant is currently not accepting orders.' });
    }

    // Re-verify menu item availability & authoritative server-side pricing
    const resolvedItems: Order['items'] = [];
    let subtotal = 0;
    for (const reqItem of items) {
      const menu = state.menuItems.find((m) => m.id === reqItem.menuItemId && m.restaurantId === restaurantId);
      if (!menu || !menu.available) {
        return res.status(409).json({
          error: `Item "${menu?.name || reqItem.menuItemId}" just became unavailable. Please update your cart.`,
        });
      }
      const qty = Math.max(1, Math.min(20, Math.floor(reqItem.qty)));
      subtotal += menu.price * qty;
      resolvedItems.push({
        menuItemId: menu.id,
        name: menu.name,
        qty,
        unitPrice: menu.price,
        isVeg: menu.isVeg,
      });
    }

    const gstAmount = Number((subtotal * 0.05).toFixed(2));
    const serviceFee = 10;
    const totalAmount = Number((subtotal + gstAmount + serviceFee).toFixed(2));
    const commissionPct = restaurant.commissionPct;
    const platformCommission = Number(((subtotal * commissionPct) / 100).toFixed(2));
    const gatewayFee = Number((totalAmount * 0.018).toFixed(2));
    const restaurantPayable = Number((subtotal - platformCommission - gatewayFee).toFixed(2));

    const trip = state.trips.find((t) => t.vehicleId === qr.vehicleId && t.routeId === qr.routeId);
    const stopEta = trip?.stopEtas.find((s) => s.restaurantId === restaurantId);
    const etaMinutesAtOrder = stopEta ? stopEta.etaMinutes : 45;
    const distanceKmAtOrder = stopEta ? stopEta.distanceRemainingKm : 40;

    const paymentSuccess = simulateOutcome !== 'FAIL';
    const order: Order = {
      id: `ORD-${Math.floor(8850 + Math.random() * 1100)}`,
      pickupCode: String(Math.floor(1000 + Math.random() * 9000)),
      idempotencyKey,
      qrId: qr.id,
      vehicleId: qr.vehicleId,
      companyId: partnership.companyId,
      routeId: qr.routeId,
      tripId: trip?.id || 'trip-unassigned',
      restaurantId,
      items: resolvedItems,
      subtotal,
      gstAmount,
      serviceFee,
      totalAmount,
      commissionPct,
      platformCommission,
      gatewayFee,
      restaurantPayable,
      orderType: orderType === 'DINE_IN' ? 'DINE_IN' : 'TAKEAWAY',
      dineInGuests: orderType === 'DINE_IN' ? dineInGuests || 1 : undefined,
      passengerName: passengerName?.trim() || 'Bus Passenger',
      passengerPhone: passengerPhone?.trim() || '+91 90000 00000',
      seatNumber: seatNumber?.trim() || undefined,
      specialInstructions: specialInstructions?.trim() || undefined,
      dietaryNotes: dietaryNotes?.trim() || undefined,
      paymentStatus: paymentSuccess ? 'VERIFIED' : 'FAILED',
      paymentRef: paymentSuccess ? `PAY-RZP-${crypto.randomBytes(3).toString('hex').toUpperCase()}` : 'PAY-ERR-GATEWAY',
      status: paymentSuccess ? 'NEW' : 'CANCELLED',
      etaMinutesAtOrder,
      distanceKmAtOrder,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    state.orders.unshift(order);

    if (paymentSuccess) {
      qr.orderCount += 1;
      const veh = state.vehicles.find((v) => v.id === qr.vehicleId);
      addNotification(
        'RESTAURANT',
        `New Paid Order · ${order.id}`,
        `${order.passengerName} (${veh?.regNumber || 'Bus'}) ordered ${resolvedItems.map((i) => `${i.qty}× ${i.name}`).join(', ')} (${order.orderType}).`,
        'ORDER',
        restaurantId
      );
      addNotification(
        'PASSENGER',
        `Payment Confirmed · ${order.id}`,
        `Your order at ${restaurant.name} is confirmed. Pickup code: ${order.pickupCode}.`,
        'PAYMENT',
        order.id
      );
      addAudit('PASSENGER', 'ORDER_CREATED_AND_PAID', order.id, `Verified ₹${totalAmount} for ${restaurant.name}`);
    } else {
      addNotification(
        'SUPER_ADMIN',
        `Payment Failure · ${order.id}`,
        `Gateway verification failed for ${order.passengerName} at ${restaurant.name} (₹${totalAmount}).`,
        'PAYMENT'
      );
      addAudit('SYSTEM', 'PAYMENT_FAILED', order.id, `Gateway returned failure for ₹${totalAmount}`);
    }

    broadcastState();
    res.status(paymentSuccess ? 201 : 402).json({ ok: paymentSuccess, order });
  });

  // Retry Payment on a Failed Order
  app.post('/api/orders/:id/retry-payment', (req, res) => {
    const order = state.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus === 'VERIFIED') {
      return res.json({ ok: true, order, idempotentHit: true });
    }
    const restaurant = state.restaurants.find((r) => r.id === order.restaurantId);
    if (!restaurant || !restaurant.acceptingOrders) {
      return res.status(409).json({ error: 'Restaurant is no longer accepting orders.' });
    }

    order.paymentStatus = 'VERIFIED';
    order.paymentRef = `PAY-RZP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    order.status = 'NEW';
    order.updatedAt = nowIso();

    const qr = state.qrCodes.find((q) => q.id === order.qrId);
    if (qr) qr.orderCount += 1;

    addNotification(
      'RESTAURANT',
      `New Paid Order · ${order.id}`,
      `Retry payment verified for ${order.passengerName} (${order.orderType}).`,
      'ORDER',
      order.restaurantId
    );
    addAudit('PASSENGER', 'PAYMENT_RETRY_VERIFIED', order.id, `Verified retry payment ${order.paymentRef}`);
    broadcastState();
    res.json({ ok: true, order });
  });

  // Update Order Status (Restaurant / Conductor / Admin)
  app.patch('/api/orders/:id/status', (req, res) => {
    const { status, reason, actorRole = 'RESTAURANT' } = req.body as {
      status: OrderStatus;
      reason?: string;
      actorRole?: string;
    };
    const order = state.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus === 'FAILED') {
      return res.status(400).json({ error: 'Cannot advance an unpaid failed order.' });
    }

    order.status = status;
    order.updatedAt = nowIso();

    const restaurant = state.restaurants.find((r) => r.id === order.restaurantId);
    if (status === 'REJECTED') {
      order.rejectionReason = reason || 'Kitchen at full capacity';
      order.paymentStatus = 'REFUNDED';
      addNotification(
        'PASSENGER',
        `Order Refunded · ${order.id}`,
        `${restaurant?.name || 'Restaurant'} could not fulfill ${order.id}. Full refund of ₹${order.totalAmount} initiated.`,
        'PAYMENT',
        order.id
      );
      addNotification(
        'SUPER_ADMIN',
        `Order Rejected & Refunded · ${order.id}`,
        `${restaurant?.name} rejected ${order.id}. Refund ₹${order.totalAmount} processed.`,
        'PAYMENT'
      );
    } else {
      const labelMap: Record<string, string> = {
        ACCEPTED: 'Restaurant accepted your order',
        PREPARING: 'Kitchen started preparing your meal',
        READY: `Food is READY! Show pickup code ${order.pickupCode}`,
        COMPLETED: 'Order collected & completed. Enjoy your journey!',
      };
      if (labelMap[status]) {
        addNotification('PASSENGER', `${order.id} · ${status}`, labelMap[status], 'ORDER', order.id);
      }
    }

    addAudit(actorRole, `ORDER_${status}`, order.id, `Order moved to ${status}`);
    broadcastState();
    res.json({ ok: true, order });
  });

  // Driver Trip Lifecycle & Real GPS Updates
  app.post('/api/trips/:id/start', (req, res) => {
    const trip = state.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found.' });
    if (trip.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Completed trips cannot be restarted.' });
    }
    trip.status = 'IN_PROGRESS';
    trip.speedKmh = 64;
    trip.startedAt = trip.startedAt || nowIso();
    trip.lastUpdatedAt = nowIso();

    const veh = state.vehicles.find((v) => v.id === trip.vehicleId);
    const route = state.routes.find((r) => r.id === trip.routeId);
    addNotification(
      'SUPER_ADMIN',
      `Trip Started · ${veh?.regNumber}`,
      `Live GPS tracking enabled on ${route?.name}.`,
      'TRIP'
    );
    addAudit('DRIVER', 'TRIP_STARTED', trip.id, `GPS tracking started for ${veh?.regNumber}`);
    broadcastState();
    res.json({ ok: true, trip });
  });

  app.post('/api/trips/:id/gps', (req, res) => {
    const { progressPct, speedKmh } = req.body as { progressPct: number; speedKmh?: number };
    const trip = state.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found.' });
    if (trip.status !== 'IN_PROGRESS') {
      return res.status(403).json({ error: 'GPS updates are only permitted during an active IN_PROGRESS trip.' });
    }

    const route = state.routes.find((r) => r.id === trip.routeId);
    if (!route) return res.status(404).json({ error: 'Route not found.' });

    const clampedPct = Math.max(0, Math.min(100, Number(progressPct)));
    const speed = speedKmh !== undefined ? Math.max(20, Math.min(110, Number(speedKmh))) : trip.speedKmh || 66;
    const pos = interpolateRoutePosition(route.stops, clampedPct);

    trip.progressPct = clampedPct;
    trip.currentKm = pos.currentKm;
    trip.currentLat = pos.lat;
    trip.currentLng = pos.lng;
    trip.speedKmh = speed;
    trip.headingDeg = pos.headingDeg;
    trip.stopEtas = computeStopEtas(route.stops, pos.currentKm, speed);
    trip.lastUpdatedAt = nowIso();

    // Check approaching notifications for partner restaurants
    const veh = state.vehicles.find((v) => v.id === trip.vehicleId);
    for (const stopEta of trip.stopEtas) {
      if (stopEta.restaurantId && !stopEta.passed && stopEta.etaMinutes <= 15 && stopEta.etaMinutes >= 1) {
        const activeOrdersForStop = state.orders.filter(
          (o) =>
            o.tripId === trip.id &&
            o.restaurantId === stopEta.restaurantId &&
            ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)
        );
        if (activeOrdersForStop.length > 0) {
          const alreadyRecent = state.notifications.some(
            (n) =>
              n.targetRole === 'RESTAURANT' &&
              n.targetId === stopEta.restaurantId &&
              n.type === 'ETA' &&
              n.message.includes(`${stopEta.etaMinutes} min`)
          );
          if (!alreadyRecent) {
            addNotification(
              'RESTAURANT',
              `Bus Arriving Soon · ${veh?.regNumber}`,
              `${veh?.regNumber} is ${stopEta.distanceRemainingKm} km away (ETA ${stopEta.etaMinutes} mins) with ${activeOrdersForStop.length} active order(s).`,
              'ETA',
              stopEta.restaurantId
            );
          }
        }
      }
    }

    broadcastState('gps:update');
    res.json({ ok: true, trip });
  });

  app.post('/api/trips/:id/end', (req, res) => {
    const trip = state.trips.find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found.' });
    trip.status = 'COMPLETED';
    trip.speedKmh = 0;
    trip.completedAt = nowIso();
    trip.lastUpdatedAt = nowIso();

    const veh = state.vehicles.find((v) => v.id === trip.vehicleId);
    addAudit('DRIVER', 'TRIP_ENDED', trip.id, `GPS tracking stopped for ${veh?.regNumber}`);
    broadcastState();
    res.json({ ok: true, trip });
  });

  // Restaurant Admin & Partner Controls
  app.post('/api/restaurants', (req, res) => {
    const body = req.body as Partial<Restaurant>;
    if (!body.name || !body.ownerName || !body.city) {
      return res.status(400).json({ error: 'Restaurant name, owner, and city are required.' });
    }
    const created: Restaurant = {
      id: makeId('rest').toLowerCase(),
      name: body.name.trim(),
      ownerName: body.ownerName.trim(),
      mobile: body.mobile || '+91 98000 00000',
      email: body.email || 'partner@routestop.in',
      address: body.address || `${body.city} Highway Bypass`,
      city: body.city.trim(),
      lat: body.lat || 11.5,
      lng: body.lng || 78.5,
      operatingHours: body.operatingHours || '06:00 AM – 11:30 PM',
      status: 'APPROVED',
      acceptingOrders: true,
      commissionPct: Number(body.commissionPct ?? 5),
      gstNumber: body.gstNumber || '33AAACR9012M1Z1',
      fssaiNumber: body.fssaiNumber || '12425001009912',
      bankAccount: body.bankAccount || 'HDFC •••• 1190',
      branches: [`${body.city} Main Highway Bay`],
      heroImage: IMG_HERO,
      rating: 4.7,
      avgPrepMinutes: 12,
      createdAt: nowIso(),
    };
    state.restaurants.push(created);
    addAudit('SUPER_ADMIN', 'RESTAURANT_CREATED', created.id, `Registered ${created.name}`);
    broadcastState();
    res.status(201).json({ ok: true, restaurant: created });
  });

  app.patch('/api/restaurants/:id', (req, res) => {
    const rest = state.restaurants.find((r) => r.id === req.params.id);
    if (!rest) return res.status(404).json({ error: 'Restaurant not found.' });
    const updates = req.body as Partial<Restaurant>;
    if (updates.status) rest.status = updates.status;
    if (typeof updates.acceptingOrders === 'boolean') rest.acceptingOrders = updates.acceptingOrders;
    if (typeof updates.commissionPct === 'number') {
      rest.commissionPct = Math.max(0, Math.min(30, updates.commissionPct));
    }
    if (updates.operatingHours) rest.operatingHours = updates.operatingHours;
    if (updates.branches) rest.branches = updates.branches;

    addAudit('SUPER_ADMIN', 'RESTAURANT_UPDATED', rest.id, `Updated ${rest.name} (${rest.status})`);
    broadcastState();
    res.json({ ok: true, restaurant: rest });
  });

  app.post('/api/menu-items', (req, res) => {
    const body = req.body as {
      restaurantId: string;
      category: string;
      name: string;
      description: string;
      price: number;
      isVeg: boolean;
      prepMinutes?: number;
    };
    if (!body.restaurantId || !body.name || !body.price) {
      return res.status(400).json({ error: 'Missing required menu item fields.' });
    }
    const imageMap: Record<string, string> = {
      'South Indian Classics': IMG_DOSA,
      'Rice & Biryani': IMG_BIRYANI,
      'Beverages & Quick Bites': IMG_COFFEE,
      'Executive Meals': IMG_THALI,
    };
    const item = {
      id: makeId('item').toLowerCase(),
      restaurantId: body.restaurantId,
      category: body.category || 'Executive Meals',
      name: body.name.trim(),
      description: body.description?.trim() || 'Freshly prepared for highway transit travelers.',
      price: Number(body.price),
      isVeg: Boolean(body.isVeg),
      available: true,
      image: imageMap[body.category] || IMG_THALI,
      prepMinutes: Number(body.prepMinutes || 10),
    };
    state.menuItems.push(item);
    broadcastState();
    res.status(201).json({ ok: true, item });
  });

  app.patch('/api/menu-items/:id', (req, res) => {
    const item = state.menuItems.find((m) => m.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Menu item not found.' });
    const { available, price } = req.body as { available?: boolean; price?: number };
    if (typeof available === 'boolean') item.available = available;
    if (typeof price === 'number' && price > 0) item.price = price;
    broadcastState();
    res.json({ ok: true, item });
  });

  // Transport Company & Vehicle Management
  app.post('/api/companies', (req, res) => {
    const body = req.body as Partial<TransportCompany>;
    if (!body.name || !body.ownerName) {
      return res.status(400).json({ error: 'Company name and owner are required.' });
    }
    const created: TransportCompany = {
      id: makeId('comp').toLowerCase(),
      name: body.name.trim(),
      ownerName: body.ownerName.trim(),
      mobile: body.mobile || '+91 98400 00000',
      email: body.email || 'fleet@transport.in',
      registrationNo: body.registrationNo || `TN-01-TR-${Math.floor(10000 + Math.random() * 89999)}`,
      status: 'APPROVED',
      documentRef: 'RC-FLEET-VERIFIED.pdf',
      createdAt: nowIso(),
    };
    state.companies.push(created);
    addAudit('SUPER_ADMIN', 'COMPANY_REGISTERED', created.id, `Registered ${created.name}`);
    broadcastState();
    res.status(201).json({ ok: true, company: created });
  });

  app.patch('/api/companies/:id', (req, res) => {
    const company = state.companies.find((c) => c.id === req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    const { status } = req.body as { status: TransportCompany['status'] };
    if (status) company.status = status;
    addAudit('SUPER_ADMIN', 'COMPANY_STATUS_UPDATED', company.id, `${company.name} → ${company.status}`);
    broadcastState();
    res.json({ ok: true, company });
  });

  app.post('/api/vehicles', (req, res) => {
    const body = req.body as Partial<Vehicle>;
    if (!body.regNumber || !body.companyId || !body.routeId) {
      return res.status(400).json({ error: 'Registration number, company, and route are required.' });
    }
    const created: Vehicle = {
      id: makeId('veh').toLowerCase(),
      companyId: body.companyId,
      regNumber: body.regNumber.toUpperCase().trim(),
      type: body.type || 'AC Sleeper',
      seatingCapacity: Number(body.seatingCapacity || 36),
      routeId: body.routeId,
      driverId: body.driverId || 'drv-1',
      conductorId: body.conductorId || 'cnd-1',
      status: 'ACTIVE',
    };
    state.vehicles.push(created);
    const route = state.routes.find((r) => r.id === created.routeId);
    if (route) {
      const pos = interpolateRoutePosition(route.stops, 0);
      state.trips.push({
        id: makeId('trip').toLowerCase(),
        vehicleId: created.id,
        routeId: route.id,
        driverId: created.driverId,
        conductorId: created.conductorId,
        status: 'READY_TO_START',
        progressPct: 0,
        currentKm: pos.currentKm,
        currentLat: pos.lat,
        currentLng: pos.lng,
        speedKmh: 0,
        headingDeg: pos.headingDeg,
        stopEtas: computeStopEtas(route.stops, pos.currentKm, 65),
        lastUpdatedAt: nowIso(),
      });
    }
    addAudit('SUPER_ADMIN', 'VEHICLE_ADDED', created.id, `Added ${created.regNumber}`);
    broadcastState();
    res.status(201).json({ ok: true, vehicle: created });
  });

  // Route Management
  app.post('/api/routes', (req, res) => {
    const { name, origin, destination, totalKm, restaurantIds } = req.body as {
      name: string;
      origin: string;
      destination: string;
      totalKm: number;
      restaurantIds?: string[];
    };
    if (!name || !origin || !destination) {
      return res.status(400).json({ error: 'Route name, origin, and destination are required.' });
    }
    const kmTotal = Math.max(50, Number(totalKm || 250));
    const stops: RouteStop[] = [
      {
        id: makeId('stop').toLowerCase(),
        name: `${origin} Terminus`,
        kmFromOrigin: 0,
        lat: 13.08,
        lng: 80.27,
        expectedArrivalWindow: '20:00 Dep',
      },
    ];
    const selectedRests = (restaurantIds || []).map((id) => state.restaurants.find((r) => r.id === id)).filter(Boolean) as Restaurant[];
    selectedRests.forEach((rest, idx) => {
      const km = Math.round(((idx + 1) / (selectedRests.length + 1)) * kmTotal);
      stops.push({
        id: makeId('stop').toLowerCase(),
        name: `${rest.city} Plaza`,
        kmFromOrigin: km,
        lat: rest.lat,
        lng: rest.lng,
        expectedArrivalWindow: 'Stop Window',
        restaurantId: rest.id,
      });
    });
    stops.push({
      id: makeId('stop').toLowerCase(),
      name: `${destination} Terminus`,
      kmFromOrigin: kmTotal,
      lat: 10.78,
      lng: 78.69,
      expectedArrivalWindow: '03:00 Arr',
    });

    const created: HighwayRoute = {
      id: makeId('route').toLowerCase(),
      name: name.trim(),
      code: `NH-${Math.floor(10 + Math.random() * 89)}`,
      origin: origin.trim(),
      destination: destination.trim(),
      totalKm: kmTotal,
      stops,
    };
    state.routes.push(created);
    addAudit('SUPER_ADMIN', 'ROUTE_CREATED', created.id, `Created corridor ${created.name}`);
    broadcastState();
    res.status(201).json({ ok: true, route: created });
  });

  // Bus–Restaurant Partnership & Dynamic QR Creation
  app.post('/api/partnerships', (req, res) => {
    const { companyId, vehicleId, routeId, restaurantIds, startDate, endDate } = req.body as {
      companyId: string;
      vehicleId: string;
      routeId: string;
      restaurantIds: string[];
      startDate?: string;
      endDate?: string;
    };
    if (!companyId || !vehicleId || !routeId || !restaurantIds?.length) {
      return res.status(400).json({ error: 'Company, vehicle, route, and at least one restaurant are required.' });
    }

    const partnership: Partnership = {
      id: makeId('part').toLowerCase(),
      companyId,
      vehicleId,
      routeId,
      restaurantIds,
      startDate: startDate || '2026-11-25',
      endDate: endDate || '2027-11-25',
      status: 'APPROVED',
      createdAt: nowIso(),
    };
    state.partnerships.unshift(partnership);

    const veh = state.vehicles.find((v) => v.id === vehicleId);
    const shortReg = (veh?.regNumber || 'BUS').replace(/\s+/g, '').slice(0, 4);
    const qr: QRCodeRecord = {
      id: makeId('qr').toLowerCase(),
      token: `RS-${shortReg}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      partnershipId: partnership.id,
      vehicleId,
      routeId,
      active: true,
      scanCount: 0,
      orderCount: 0,
      createdAt: nowIso(),
    };
    state.qrCodes.unshift(qr);

    addAudit('SUPER_ADMIN', 'PARTNERSHIP_CREATED', partnership.id, `Linked ${veh?.regNumber} with ${restaurantIds.length} restaurant(s) & generated QR ${qr.token}`);
    broadcastState();
    res.status(201).json({ ok: true, partnership, qr });
  });

  app.patch('/api/partnerships/:id', (req, res) => {
    const part = state.partnerships.find((p) => p.id === req.params.id);
    if (!part) return res.status(404).json({ error: 'Partnership not found.' });
    const { status } = req.body as { status: 'APPROVED' | 'INACTIVE' };
    if (status) part.status = status;
    broadcastState();
    res.json({ ok: true, partnership: part });
  });

  app.patch('/api/qr/:id/toggle', (req, res) => {
    const qr = state.qrCodes.find((q) => q.id === req.params.id);
    if (!qr) return res.status(404).json({ error: 'QR not found.' });
    qr.active = !qr.active;
    addAudit('SUPER_ADMIN', 'QR_TOGGLED', qr.id, `QR ${qr.token} is now ${qr.active ? 'Active' : 'Disabled'}`);
    broadcastState();
    res.json({ ok: true, qr });
  });

  app.post('/api/qr/:id/regenerate', (req, res) => {
    const qr = state.qrCodes.find((q) => q.id === req.params.id);
    if (!qr) return res.status(404).json({ error: 'QR not found.' });
    const veh = state.vehicles.find((v) => v.id === qr.vehicleId);
    const shortReg = (veh?.regNumber || 'BUS').replace(/\s+/g, '').slice(0, 4);
    qr.token = `RS-${shortReg}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    addAudit('SUPER_ADMIN', 'QR_REGENERATED', qr.id, `Regenerated opaque token ${qr.token}`);
    broadcastState();
    res.json({ ok: true, qr });
  });

  // Settlements
  app.post('/api/settlements/:restaurantId/settle', (req, res) => {
    const { restaurantId } = req.params;
    const rest = state.restaurants.find((r) => r.id === restaurantId);
    if (!rest) return res.status(404).json({ error: 'Restaurant not found.' });

    const settledOrderIds = new Set(state.settlements.flatMap((s) => s.orderIds));
    const eligible = state.orders.filter(
      (o) =>
        o.restaurantId === restaurantId &&
        o.paymentStatus === 'VERIFIED' &&
        o.status !== 'REJECTED' &&
        o.status !== 'CANCELLED' &&
        !settledOrderIds.has(o.id)
    );

    if (eligible.length === 0) {
      return res.status(400).json({ error: 'No unsettled eligible orders for this restaurant.' });
    }

    const grossAmount = Number(eligible.reduce((s, o) => s + o.subtotal, 0).toFixed(2));
    const commissionAmount = Number(eligible.reduce((s, o) => s + o.platformCommission, 0).toFixed(2));
    const gatewayFeeTotal = Number(eligible.reduce((s, o) => s + o.gatewayFee, 0).toFixed(2));
    const gstOnFees = Number(((commissionAmount + gatewayFeeTotal) * 0.18).toFixed(2));
    const netPayable = Number((grossAmount - commissionAmount - gatewayFeeTotal - gstOnFees).toFixed(2));

    const settlement: Settlement = {
      id: `STL-2026-${Math.floor(200 + Math.random() * 799)}`,
      restaurantId,
      orderIds: eligible.map((o) => o.id),
      grossAmount,
      commissionAmount,
      gatewayFeeTotal,
      gstOnFees,
      netPayable,
      status: 'SETTLED',
      settledAt: nowIso(),
      utrRef: `UTR${Date.now().toString().slice(-10)}`,
    };
    state.settlements.unshift(settlement);

    addNotification(
      'RESTAURANT',
      `Settlement Disbursed · ₹${netPayable.toFixed(2)}`,
      `Settled ${eligible.length} order(s) via ${settlement.utrRef} to ${rest.bankAccount}.`,
      'PAYMENT',
      restaurantId
    );
    addAudit('SUPER_ADMIN', 'SETTLEMENT_DISBURSED', settlement.id, `Settled ₹${netPayable} to ${rest.name}`);
    broadcastState();
    res.status(201).json({ ok: true, settlement });
  });

  // Local development only: Vite serves the frontend through this server.
  // In production, GitHub Pages hosts the frontend and Render hosts this API.
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT || 10000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RouteStop server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RouteStop server:', err);
  process.exit(1);
});
