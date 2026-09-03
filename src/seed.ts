import { prisma } from "./lib/prisma";
import bcrypt from "bcryptjs";

const img = (seed: string) => `https://picsum.photos/seed/${seed}/400/400`;

const categories = [
  { name: "Electronica e Tecnologia", slug: "electronica-tecnologia", icon: "smartphone" },
  { name: "Roupa e Acessorios", slug: "roupa-acessorios", icon: "shirt" },
  { name: "Eletrodomesticos", slug: "eletrodomesticos", icon: "washing-machine" },
  { name: "Moveis e Decoracao", slug: "moveis-decoracao", icon: "sofa" },
  { name: "Desporto e Lazer", slug: "desporto-lazer", icon: "dumbbell" },
  { name: "Beleza e Saude", slug: "beleza-saude", icon: "heart" },
  { name: "Automoveis", slug: "automoveis", icon: "car" },
  { name: "Educacao e Livros", slug: "educacao-livros", icon: "book-open" },
  { name: "Alimentos e Bebidas", slug: "alimentos-bebidas", icon: "apple" },
  { name: "Infantil", slug: "infantil", icon: "baby" },
  { name: "Animais de Estimacao", slug: "animais-estimacao", icon: "paw-print" },
  { name: "Servicos", slug: "servicos", icon: "briefcase" },
];

const sellers = [
  { email: "vendedor@pambala.ao", name: "Maria Silva", phone: "+244912345678", store: "Loja Maria", storeSlug: "loja-maria", desc: "Electronica e acessorios em Luanda" },
  { email: "loja2@pambala.ao", name: "Joao Santos", phone: "+244923456789", store: "TechStore AO", storeSlug: "techstore-ao", desc: "Gadgets e tecnologia de ponta" },
  { email: "loja3@pambala.ao", name: "Ana Fernandes", phone: "+244934567890", store: "Moda Angola", storeSlug: "moda-angola", desc: "Roupa e acessorios da moda" },
];

const provinces = ["Luanda", "Benguela", "Huambo", "Cabinda", "Lubango", "Namibe", "Uige", "Malanje"];

type Cond = "NEW" | "USED" | "REFURBISHED";

interface P { name: string; slug: string; desc: string; price: number; cmp?: number; cond: Cond; stock: number; cat: string; views: number; img: string; }

const all: P[] = [
  // ── Electronica (20) ──
  { name: "iPhone 15 Pro Max 256GB", slug: "iphone-15-pro-max-256gb", desc: "Smartphone Apple com chip A17 Pro, tela 6.7 OLED", price: 850000, cmp: 950000, cond: "NEW", stock: 10, cat: "electronica-tecnologia", views: 245, img: "iphone-15-pro" },
  { name: "Samsung Galaxy S24 Ultra", slug: "samsung-galaxy-s24-ultra", desc: "Smartphone Samsung com S Pen e camera 200MP", price: 750000, cmp: 820000, cond: "NEW", stock: 8, cat: "electronica-tecnologia", views: 189, img: "samsung-galaxy" },
  { name: "MacBook Pro 14 M3", slug: "macbook-pro-14-m3", desc: "Portatil Apple com chip M3 e 18GB RAM", price: 1200000, cmp: 1350000, cond: "NEW", stock: 4, cat: "electronica-tecnologia", views: 312, img: "macbook-pro" },
  { name: "iPad Air M2 256GB", slug: "ipad-air-m2-256gb", desc: "Tablet Apple iPad Air com chip M2", price: 520000, cmp: 580000, cond: "NEW", stock: 12, cat: "electronica-tecnologia", views: 178, img: "ipad-apple" },
  { name: "AirPods Pro 2a Geracao", slug: "airpods-pro-2", desc: "Auscultadores Apple com cancelamento de ruido", price: 95000, cmp: 110000, cond: "NEW", stock: 20, cat: "electronica-tecnologia", views: 201, img: "airpods-apple" },
  { name: "Xiaomi Redmi Note 13 Pro", slug: "xiaomi-redmi-note-13-pro", desc: "Smartphone Xiaomi camera 200MP, AMOLED 120Hz", price: 95000, cmp: 115000, cond: "NEW", stock: 25, cat: "electronica-tecnologia", views: 134, img: "xiaomi-phone" },
  { name: "PlayStation 5 Slim", slug: "playstation-5-slim", desc: "Consola Sony PS5 Slim 1TB SSD", price: 380000, cmp: 420000, cond: "NEW", stock: 6, cat: "electronica-tecnologia", views: 267, img: "playstation-5" },
  { name: "Nintendo Switch OLED", slug: "nintendo-switch-oled", desc: "Consola Nintendo Switch tela OLED 7\"", price: 280000, cmp: 320000, cond: "NEW", stock: 8, cat: "electronica-tecnologia", views: 156, img: "nintendo-switch" },
  { name: "Samsung Galaxy Tab S9", slug: "samsung-galaxy-tab-s9", desc: "Tablet Samsung com S Pen e 128GB", price: 350000, cmp: 400000, cond: "NEW", stock: 7, cat: "electronica-tecnologia", views: 98, img: "samsung-tablet" },
  { name: "Monitor LG UltraWide 34", slug: "monitor-lg-ultrawide-34", desc: "Monitor curvo ultrawide WQHD 100Hz", price: 280000, cmp: 340000, cond: "NEW", stock: 5, cat: "electronica-tecnologia", views: 87, img: "ultrawide-monitor" },
  { name: "Logitech MX Master 3S", slug: "logitech-mx-master-3s", desc: "Mouse wireless profissional MagSpeed", price: 45000, cmp: 55000, cond: "NEW", stock: 15, cat: "electronica-tecnologia", views: 112, img: "logitech-mouse" },
  { name: "Apple Watch Series 9", slug: "apple-watch-series-9", desc: "Relogio inteligente Apple GPS", price: 320000, cmp: 360000, cond: "NEW", stock: 9, cat: "electronica-tecnologia", views: 189, img: "apple-watch" },
  { name: "Samsung Galaxy Buds2 Pro", slug: "samsung-galaxy-buds2-pro", desc: "Auscultadores Samsung ANC 360", price: 65000, cmp: 80000, cond: "NEW", stock: 18, cat: "electronica-tecnologia", views: 145, img: "samsung-buds" },
  { name: "Dell XPS 15", slug: "dell-xps-15", desc: "Portatil Dell Intel i7 13a gen 16GB", price: 650000, cmp: 750000, cond: "NEW", stock: 3, cat: "electronica-tecnologia", views: 134, img: "dell-laptop" },
  { name: "Canon EOS R6 Mark II", slug: "canon-eos-r6-mark-ii", desc: "Camera mirrorless full-frame 24.2MP", price: 890000, cmp: 980000, cond: "NEW", stock: 2, cat: "electronica-tecnologia", views: 76, img: "canon-camera" },
  { name: "JBL Charge 5", slug: "jbl-charge-5", desc: "Coluna bluetooth IP67 resistente a agua", price: 55000, cmp: 68000, cond: "NEW", stock: 22, cat: "electronica-tecnologia", views: 198, img: "jbl-speaker" },
  { name: "iPhone 13 128GB Usado", slug: "iphone-13-128gb-usado", desc: "iPhone 13 excelente estado", price: 280000, cmp: 450000, cond: "USED", stock: 3, cat: "electronica-tecnologia", views: 156, img: "iphone-used" },
  { name: "Samsung Galaxy S23 Usado", slug: "samsung-galaxy-s23-usado", desc: "Galaxy S23 bom estado com capa", price: 320000, cmp: 500000, cond: "USED", stock: 2, cat: "electronica-tecnologia", views: 112, img: "samsung-used" },
  { name: "GoPro Hero 12 Black", slug: "gopro-hero-12-black", desc: "Camera de accao 5.3K60", price: 220000, cmp: 260000, cond: "NEW", stock: 6, cat: "electronica-tecnologia", views: 143, img: "gopro-camera" },
  { name: "Kindle Paperwhite 11a Gen", slug: "kindle-paperwhite-11", desc: "E-reader Amazon 6.8\" luz ajustavel", price: 75000, cmp: 90000, cond: "NEW", stock: 14, cat: "electronica-tecnologia", views: 89, img: "kindle-reader" },

  // ── Roupa e Acessorios (18) ──
  { name: "Tenis Nike Air Max 90", slug: "tenis-nike-air-max-90", desc: "Tenis classico Nike confortavel", price: 45000, cmp: 55000, cond: "NEW", stock: 25, cat: "roupa-acessorios", views: 120, img: "nike-shoes" },
  { name: "Tenis Adidas Ultraboost", slug: "tenis-adidas-ultraboost", desc: "Tenis de corrida Boost", price: 52000, cmp: 62000, cond: "NEW", stock: 18, cat: "roupa-acessorios", views: 134, img: "adidas-sneakers" },
  { name: "Camiseta Polo Lacoste", slug: "camiseta-polo-lacoste", desc: "Polo original algodao", price: 35000, cmp: 45000, cond: "NEW", stock: 20, cat: "roupa-acessorios", views: 98, img: "polo-shirt" },
  { name: "Vestido Longo Floral", slug: "vestido-longo-floral", desc: "Vestido estampado floral", price: 28000, cmp: 35000, cond: "NEW", stock: 12, cat: "roupa-acessorios", views: 87, img: "floral-dress" },
  { name: "Bolsa Louis Vuitton Replica", slug: "bolsa-lv-replica", desc: "Bolsa replica alta qualidade", price: 15000, cmp: 25000, cond: "NEW", stock: 8, cat: "roupa-acessorios", views: 156, img: "designer-bag" },
  { name: "Oculos Ray-Ban Aviator", slug: "oculos-rayban-aviator", desc: "Oculos polarizado classico", price: 32000, cmp: 40000, cond: "NEW", stock: 15, cat: "roupa-acessorios", views: 178, img: "sunglasses-aviator" },
  { name: "Relogio Casio G-Shock", slug: "relogio-casio-gshock", desc: "Relogio resistente a choques", price: 42000, cmp: 52000, cond: "NEW", stock: 10, cat: "roupa-acessorios", views: 134, img: "casio-watch" },
  { name: "Jaqueta de Couro Masculina", slug: "jaqueta-couro-masculina", desc: "Jaqueta couro genuino preta", price: 65000, cmp: 80000, cond: "NEW", stock: 6, cat: "roupa-acessorios", views: 98, img: "leather-jacket" },
  { name: "Calca Jeans Levi's 501", slug: "calca-jeans-levis-501", desc: "Calca jeans classica Levi's", price: 25000, cmp: 32000, cond: "NEW", stock: 22, cat: "roupa-acessorios", views: 112, img: "jeans-levis" },
  { name: "Terno Masculino Completo", slug: "terno-masculino-completo", desc: "Terno 3 pecas Slim Fit", price: 85000, cmp: 110000, cond: "NEW", stock: 5, cat: "roupa-acessorios", views: 67, img: "men-suit" },
  { name: "Bermuda Masculina Cargo", slug: "bermuda-cargo-masculina", desc: "Bermuda cargo algodao", price: 12000, cmp: 16000, cond: "NEW", stock: 30, cat: "roupa-acessorios", views: 89, img: "cargo-shorts" },
  { name: "Gorra Nike Original", slug: "gorra-nike-original", desc: "Gorra Nike Swoosh ajustavel", price: 8000, cmp: 12000, cond: "NEW", stock: 40, cat: "roupa-acessorios", views: 145, img: "nike-cap" },
  { name: "Cinto de Couro Italiano", slug: "cinto-couro-italiano", desc: "Cinto couro legiitimo fivela", price: 18000, cmp: 24000, cond: "NEW", stock: 15, cat: "roupa-acessorios", views: 76, img: "leather-belt" },
  { name: "Sneakers Yeezy Boost 350", slug: "sneakers-yeezy-boost-350", desc: "Sneakers Adidas Yeezy", price: 75000, cmp: 95000, cond: "NEW", stock: 4, cat: "roupa-acessorios", views: 234, img: "yeezy-sneakers" },
  { name: "Chapeu Panamera Masculino", slug: "chapeu-panamera", desc: "Chapeu fedora clássico", price: 15000, cmp: 20000, cond: "NEW", stock: 12, cat: "roupa-acessorios", views: 54, img: "fedora-hat" },
  { name: "Bolsa Tote Canvas", slug: "bolsa-tote-canvas", desc: "Bolsa tote em canvas resistente", price: 9000, cmp: 14000, cond: "NEW", stock: 20, cat: "roupa-acessorios", views: 67, img: "canvas-tote-bag" },
  { name: "Cachecol de Algodao", slug: "cachecol-algodao", desc: "Cachecol lã e algodao", price: 7000, cmp: 10000, cond: "NEW", stock: 25, cat: "roupa-acessorios", views: 43, img: "cotton-scarf" },
  { name: "Tenis Converse All Star", slug: "tenis-converse-allstar", desc: "Tenis classico Converse Chuck Taylor", price: 22000, cmp: 28000, cond: "NEW", stock: 20, cat: "roupa-acessorios", views: 167, img: "converse-shoes" },

  // ── Eletrodomesticos (15) ──
  { name: "Smart TV 55\" Samsung 4K", slug: "smart-tv-55-samsung-4k", desc: "TV Samsung Crystal UHD 55\"", price: 320000, cmp: 380000, cond: "NEW", stock: 5, cat: "eletrodomesticos", views: 198, img: "samsung-tv" },
  { name: "Ar Condicionado Split 12000 BTU", slug: "ar-condicionado-12000", desc: "AC inverter com instalacao", price: 95000, cmp: 110000, cond: "NEW", stock: 7, cat: "eletrodomesticos", views: 201, img: "air-conditioner" },
  { name: "Maquina de Lavar 10kg Samsung", slug: "maquina-lavar-10kg", desc: "Maquina de lavar digital Ecobubble", price: 145000, cmp: 170000, cond: "NEW", stock: 4, cat: "eletrodomesticos", views: 156, img: "washing-machine" },
  { name: "Aspirador Robot Roborock S8", slug: "aspirador-robot-roborock-s8", desc: "Aspirador robot com mopping", price: 120000, cmp: 145000, cond: "NEW", stock: 6, cat: "eletrodomesticos", views: 89, img: "robot-vacuum" },
  { name: "Air Fryer Philips 4.1L", slug: "airfryer-philips-4l", desc: "Fritadeira sem oleo 4.1 litros", price: 42000, cmp: 55000, cond: "NEW", stock: 12, cat: "eletrodomesticos", views: 178, img: "air-fryer" },
  { name: "Microondas Panasonic 25L", slug: "microondas-panasonic-25l", desc: "Microondas digital 25 litros", price: 35000, cmp: 42000, cond: "NEW", stock: 8, cat: "eletrodomesticos", views: 98, img: "microwave-oven" },
  { name: "Liquidificador Oster 1.5L", slug: "liquidificador-oster-15l", desc: "Liquidificador profissional 12 velocidades", price: 18000, cmp: 24000, cond: "NEW", stock: 15, cat: "eletrodomesticos", views: 87, img: "blender-kitchen" },
  { name: "Ferro de Passar a Vapor Tefal", slug: "ferro-passar-tefal", desc: "Ferro a vapor 2400W", price: 22000, cmp: 28000, cond: "NEW", stock: 10, cat: "eletrodomesticos", views: 67, img: "steam-iron" },
  { name: "Purificador de Agua 5L", slug: "purificador-agua-5l", desc: "Purificador com filtros inclusos", price: 28000, cmp: 35000, cond: "NEW", stock: 9, cat: "eletrodomesticos", views: 134, img: "water-purifier" },
  { name: "Chaleira Eletrica Inox", slug: "chaleira-eletrica-inox", desc: "Chaleira 1.7L aco inox", price: 12000, cmp: 16000, cond: "NEW", stock: 20, cat: "eletrodomesticos", views: 76, img: "electric-kettle" },
  { name: "Ventilador de Mesa 40cm", slug: "ventilador-mesa-40cm", desc: "Ventilador 3 velocidades silencioso", price: 8000, cmp: 12000, cond: "NEW", stock: 25, cat: "eletrodomesticos", views: 112, img: "table-fan" },
  { name: "Smart TV 43\" LG Full HD", slug: "smart-tv-43-lg-fhd", desc: "TV LG WebOS 43 polegadas", price: 195000, cmp: 230000, cond: "NEW", stock: 6, cat: "eletrodomesticos", views: 145, img: "lg-tv" },
  { name: "Maquina de Cafe Nespresso", slug: "maquina-cafe-nespresso", desc: "Cafeteira Nespresso Vertuo Next", price: 55000, cmp: 68000, cond: "NEW", stock: 8, cat: "eletrodomesticos", views: 167, img: "coffee-machine" },
  { name: "Batedeira KitchenAid 4.5L", slug: "batedeira-kitchenaid-45l", desc: "Batedeira planetaria clássica", price: 85000, cmp: 100000, cond: "NEW", stock: 3, cat: "eletrodomesticos", views: 54, img: "stand-mixer" },
  { name: "Aspirador Vertical Xiaomi", slug: "aspirador-xiaomi-vertical", desc: "Aspirador cordless 150W succao", price: 38000, cmp: 48000, cond: "NEW", stock: 10, cat: "eletrodomesticos", views: 123, img: "cordless-vacuum" },

  // ── Moveis e Decoracao (12) ──
  { name: "Sofa 3 Lugares Cinza", slug: "sofa-3-lugares-cinza", desc: "Sofa confortavel tecido premium", price: 180000, cmp: 220000, cond: "NEW", stock: 3, cat: "moveis-decoracao", views: 98, img: "sofa-living-room" },
  { name: "Mesa de Jantar 6 Cadeiras", slug: "mesa-jantar-6-cadeiras", desc: "Mesa madeira macica com 6 cadeiras", price: 250000, cmp: 310000, cond: "NEW", stock: 2, cat: "moveis-decoracao", views: 76, img: "dining-table" },
  { name: "Estante de Livros 5 Andares", slug: "estante-livros-5-andares", desc: "Estante metal e madeira industrial", price: 45000, cmp: 58000, cond: "NEW", stock: 6, cat: "moveis-decoracao", views: 89, img: "bookshelf" },
  { name: "Cama Box Queen Size", slug: "cama-box-queen", desc: "Cama box espuma densa 1.60x2.00", price: 120000, cmp: 150000, cond: "NEW", stock: 4, cat: "moveis-decoracao", views: 134, img: "bed-frame" },
  { name: "Luminaria de Pe Floor", slug: "luminaria-floor", desc: "Luminaria piso design moderno LED", price: 35000, cmp: 45000, cond: "NEW", stock: 8, cat: "moveis-decoracao", views: 67, img: "floor-lamp" },
  { name: "Armario para Roupa 2 Portas", slug: "armario-2-portas", desc: "Armario madeira 2 portas espelhadas", price: 95000, cmp: 115000, cond: "NEW", stock: 3, cat: "moveis-decoracao", views: 54, img: "wardrobe-closet" },
  { name: "Rack para TV 1.80m", slug: "rack-tv-180m", desc: "Rack moderno com LED embutido", price: 65000, cmp: 82000, cond: "NEW", stock: 5, cat: "moveis-decoracao", views: 112, img: "tv-stand" },
  { name: "Poltrona Rocker Gamers", slug: "poltrona-rocker-gamers", desc: "Cadeira gamer com almofadas", price: 75000, cmp: 95000, cond: "NEW", stock: 7, cat: "moveis-decoracao", views: 189, img: "gaming-chair" },
  { name: "Quadro Arte Abstracta 120x80", slug: "quadro-arte-abstracta", desc: "Quadro em tela com moldura", price: 18000, cmp: 25000, cond: "NEW", stock: 10, cat: "moveis-decoracao", views: 45, img: "abstract-art" },
  { name: "Relogio de Parede Moderno", slug: "relogio-parede-moderno", desc: "Relogio silencioso design minimalista", price: 12000, cmp: 18000, cond: "NEW", stock: 15, cat: "moveis-decoracao", views: 87, img: "wall-clock" },
  { name: "Cortina Blackout 2.80m", slug: "cortina-blackout-280m", desc: "Cortina blackout anti-luz tom cinza", price: 22000, cmp: 30000, cond: "NEW", stock: 12, cat: "moveis-decoracao", views: 76, img: "blackout-curtains" },
  { name: "Mesa de Escritorio Ergonomica", slug: "mesa-escritorio-ergo", desc: "Mesa electrica altura ajustavel 120x60", price: 85000, cmp: 105000, cond: "NEW", stock: 4, cat: "moveis-decoracao", views: 143, img: "standing-desk" },

  // ── Desporto e Lazer (12) ──
  { name: "Bola de Futebol Adidas", slug: "bola-futebol-adidas", desc: "Bola oficial Adidas match ball", price: 8500, cmp: 12000, cond: "NEW", stock: 50, cat: "desporto-lazer", views: 167, img: "soccer-ball" },
  { name: "Bicicleta Mountain Bike 26\"", slug: "bicicleta-mtb-26", desc: "MTB aco inox 21 velocidades", price: 85000, cmp: 105000, cond: "NEW", stock: 5, cat: "desporto-lazer", views: 198, img: "mountain-bike" },
  { name: "Esteira Electrica Domestica", slug: "esteira-electrica-domestica", desc: "Esteira dobravel 12km/h", price: 120000, cmp: 150000, cond: "NEW", stock: 3, cat: "desporto-lazer", views: 87, img: "treadmill" },
  { name: "Kit Halteres 20kg", slug: "kit-halteres-20kg", desc: "Halteres ajustaveis com barra", price: 35000, cmp: 45000, cond: "NEW", stock: 10, cat: "desporto-lazer", views: 134, img: "dumbbells" },
  { name: "Smart Watch Desportivo", slug: "smartwatch-desportivo", desc: "Relogio GPS resistente a agua IP68", price: 28000, cmp: 38000, cond: "NEW", stock: 15, cat: "desporto-lazer", views: 156, img: "sport-watch" },
  { name: "Raquete de Tenis Wilson", slug: "raquete-tenis-wilson", desc: "Raquete Wilson Pro Staff 100", price: 42000, cmp: 52000, cond: "NEW", stock: 6, cat: "desporto-lazer", views: 67, img: "tennis-racket" },
  { name: "Skateboard Completo 31\"", slug: "skateboard-completo-31", desc: "Skate poplar wood 7 camadas", price: 18000, cmp: 25000, cond: "NEW", stock: 8, cat: "desporto-lazer", views: 98, img: "skateboard" },
  { name: "Barraca Camping 4 Pessoas", slug: "barraca-camping-4p", desc: "Barraca impermeavel com mosquiteira", price: 32000, cmp: 42000, cond: "NEW", stock: 7, cat: "desporto-lazer", views: 76, img: "camping-tent" },
  { name: "Yoga Mat Premium 6mm", slug: "yoga-mat-premium", desc: "Almofada yoga antideslizante", price: 8000, cmp: 12000, cond: "NEW", stock: 20, cat: "desporto-lazer", views: 112, img: "yoga-mat" },
  { name: "Chuteira Nike Mercurial", slug: "chuteira-nike-mercurial", desc: "Chuteira futebol FGcamp", price: 55000, cmp: 68000, cond: "NEW", stock: 12, cat: "desporto-lazer", views: 189, img: "soccer-cleats" },
  { name: "Tenda Solar Camping", slug: "tenda-solar-camping", desc: "Painel solar portatil 100W", price: 28000, cmp: 35000, cond: "NEW", stock: 5, cat: "desporto-lazer", views: 54, img: "solar-panel" },
  { name: "Bola de Basquetebol Molten", slug: "bola-basquetebol-molten", desc: "Bola oficial Molten GG7X", price: 12000, cmp: 16000, cond: "NEW", stock: 18, cat: "desporto-lazer", views: 89, img: "basketball" },

  // ── Beleza e Saude (12) ──
  { name: "Kit Maquilhagem Profissional", slug: "kit-maquilhagem-profissional", desc: "Kit completo 48 pecas", price: 35000, cmp: 42000, cond: "NEW", stock: 15, cat: "beleza-saude", views: 178, img: "makeup-kit" },
  { name: "Perfume Chanel No. 5 100ml", slug: "perfume-chanel-no5", desc: "Perfume feminino clasico", price: 85000, cmp: 100000, cond: "NEW", stock: 6, cat: "beleza-saude", views: 234, img: "chanel-perfume" },
  { name: "Kit Cuidados de Pele Coreano", slug: "kit-skincare-coreano", desc: "Kit 7 passos de skincare", price: 45000, cmp: 58000, cond: "NEW", stock: 10, cat: "beleza-saude", views: 156, img: "skincare-set" },
  { name: "Maquina de Cabelo Profissional", slug: "maquina-cabelo-prof", desc: "Maquina cortar cabelo sem fio", price: 18000, cmp: 25000, cond: "NEW", stock: 12, cat: "beleza-saude", views: 134, img: "hair-clippers" },
  { name: "Secador de Cabelo Dyson", slug: "secador-dyson-supersonic", desc: "Secador Dyson Supersonic", price: 65000, cmp: 80000, cond: "NEW", stock: 4, cat: "beleza-saude", views: 198, img: "dyson-hairdryer" },
  { name: "Relaxador Muscular Eletrico", slug: "relaxador-muscular", desc: "Massajador cervical portatil", price: 15000, cmp: 22000, cond: "NEW", stock: 8, cat: "beleza-saude", views: 87, img: "neck-massager" },
  { name: "Kit Unhas Gel Completo", slug: "kit-unhas-gel", desc: "Kit maniquim com lampada UV", price: 25000, cmp: 32000, cond: "NEW", stock: 10, cat: "beleza-saude", views: 112, img: "nail-gel-kit" },
  { name: "Perfume Dior Sauvage 100ml", slug: "perfume-dior-sauvage", desc: "Perfume masculino Eau de Toilette", price: 72000, cmp: 88000, cond: "NEW", stock: 5, cat: "beleza-saude", views: 201, img: "dior-perfume" },
  { name: "Balanca Digital Corporal", slug: "balanca-digital-corp", desc: "Balanca com medidor de gordura", price: 12000, cmp: 18000, cond: "NEW", stock: 15, cat: "beleza-saude", views: 76, img: "digital-scale" },
  { name: "Massajador Rollon Jade", slug: "massajador-jade-rollon", desc: "Roller jade natural para rosto", price: 8000, cmp: 12000, cond: "NEW", stock: 20, cat: "beleza-saude", views: 98, img: "jade-roller" },
  { name: "Creme Hidratante Corporal 400ml", slug: "creme-hidratante-400ml", desc: "Hidratante manteiga de karite", price: 9000, cmp: 14000, cond: "NEW", stock: 25, cat: "beleza-saude", views: 67, img: "body-lotion" },
  { name: "Kit Acessorios Cabelo Afro", slug: "kit-acessorios-cabelo-afro", desc: "Kit pentes, spenges e oleos", price: 15000, cmp: 20000, cond: "NEW", stock: 12, cat: "beleza-saude", views: 145, img: "hair-accessories" },

  // ── Automoveis (12) ──
  { name: "Pneu Michelin 205/55R16", slug: "pneu-michelin-205-55r16", desc: "Pneu radial 4 estacoes", price: 35000, cmp: 42000, cond: "NEW", stock: 30, cat: "automoveis", views: 134, img: "car-tire" },
  { name: "Oleo Motor Castrol 5W30 4L", slug: "oleo-castrol-5w30-4l", desc: "Oleo sintetico fully synthetic", price: 12000, cmp: 16000, cond: "NEW", stock: 40, cat: "automoveis", views: 112, img: "motor-oil" },
  { name: "Som Automotivo Pioneer 12\"", slug: "som-pioneer-12", desc: "Subwoofer Pioneer 12\" 1400W", price: 45000, cmp: 58000, cond: "NEW", stock: 5, cat: "automoveis", views: 167, img: "car-subwoofer" },
  { name: "Camera Traseira Veicular", slug: "camera-traseira-veicular", desc: "Camera retrovisao HD wireless", price: 15000, cmp: 22000, cond: "NEW", stock: 12, cat: "automoveis", views: 89, img: "backup-camera" },
  { name: "Capa Automovel Universal", slug: "capa-automovel-universal", desc: "Capa Protec UV resistente a agua", price: 18000, cmp: 25000, cond: "NEW", stock: 8, cat: "automoveis", views: 76, img: "car-cover" },
  { name: "GPS Navegador 7\"", slug: "gps-navegador-7", desc: "Navegador GPS mapa Angola", price: 25000, cmp: 35000, cond: "NEW", stock: 6, cat: "automoveis", views: 54, img: "car-gps" },
  { name: "Kit-Alfinhas LED Farol", slug: "kit-led-farol", desc: "Kit 6 LED canbus H7", price: 8000, cmp: 12000, cond: "NEW", stock: 20, cat: "automoveis", views: 98, img: "led-headlights" },
  { name: "Bateria Automovel 60Ah", slug: "bateria-auto-60ah", desc: "Bateria livre manutencao 60Ah", price: 28000, cmp: 35000, cond: "NEW", stock: 10, cat: "automoveis", views: 143, img: "car-battery" },
  { name: "Tapetes Automovel 4 pecas", slug: "tapetes-auto-4pecas", desc: "Tapetes borracha universal", price: 8000, cmp: 12000, cond: "NEW", stock: 15, cat: "automoveis", views: 67, img: "car-mats" },
  { name: "Aspirador Auto 12V", slug: "aspirador-auto-12v", desc: "Aspirador portatil para carro", price: 9000, cmp: 14000, cond: "NEW", stock: 12, cat: "automoveis", views: 87, img: "car-vacuum" },
  { name: "Suporte Telefone Carro", slug: "suporte-telefone-carro", desc: "Suporte magnetic vento universa", price: 5000, cmp: 8000, cond: "NEW", stock: 30, cat: "automoveis", views: 178, img: "phone-car-mount" },
  { name: "Extensor Seguranca Bebe", slug: "extensor-seguranca-bebe", desc: "Cadeira auto Grupo 1-2-3", price: 45000, cmp: 58000, cond: "NEW", stock: 6, cat: "automoveis", views: 98, img: "car-seat-baby" },

  // ── Educacao e Livros (10) ──
  { name: "Livro Calculo I - Stewart", slug: "livro-calculo-stewart", desc: "Livro texto Calculo I 8a edicao", price: 15000, cmp: 22000, cond: "NEW", stock: 10, cat: "educacao-livros", views: 87, img: "math-textbook" },
  { name: "Kit Didatico 1a Classe", slug: "kit-didatico-1a-classe", desc: "Material escolar completo", price: 8000, cmp: 12000, cond: "NEW", stock: 25, cat: "educacao-livros", views: 134, img: "school-supplies" },
  { name: "Curso Ingles Online 12 meses", slug: "curso-ingles-12m", desc: "Acesso plataforma ingles online", price: 25000, cmp: 35000, cond: "NEW", stock: 50, cat: "educacao-livros", views: 167, img: "english-course" },
  { name: "Lousa Digital Interactiva", slug: "lousa-digital-interactiva", desc: "Lousa LED 55\" touch screen", price: 180000, cmp: 220000, cond: "NEW", stock: 2, cat: "educacao-livros", views: 54, img: "digital-whiteboard" },
  { name: "Dicionario Portugues-Anglés", slug: "dicionario-pt-en", desc: "Dicionario de bolso 2024", price: 5000, cmp: 8000, cond: "NEW", stock: 20, cat: "educacao-livros", views: 67, img: "portuguese-dictionary" },
  { name: "Mochila Escolar Ergonomica", slug: "mochila-escolar-ergo", desc: "Mochila com apoio lombar", price: 12000, cmp: 18000, cond: "NEW", stock: 15, cat: "educacao-livros", views: 112, img: "ergonomic-backpack" },
  { name: "Calculadora Cientifica Casio", slug: "calculadora-cientifica-casio", desc: "Casio fx-991EX ClassWiz", price: 8000, cmp: 12000, cond: "NEW", stock: 18, cat: "educacao-livros", views: 76, img: "scientific-calculator" },
  { name: "Tablet Educacao Infantil", slug: "tablet-educacao-infantil", desc: "Tablet com apps educativos", price: 35000, cmp: 45000, cond: "NEW", stock: 6, cat: "educacao-livros", views: 98, img: "education-tablet" },
  { name: "Livro Historia de Angola", slug: "livro-historia-angola", desc: "Historia de Angola pós-independencia", price: 7000, cmp: 10000, cond: "NEW", stock: 12, cat: "educacao-livros", views: 54, img: "angola-history-book" },
  { name: "Kit Robótica Arduino Starter", slug: "kit-arduino-starter", desc: "Kit Arduino com 50 componentes", price: 22000, cmp: 30000, cond: "NEW", stock: 8, cat: "educacao-livros", views: 143, img: "arduino-kit" },

  // ── Alimentos e Bebidas (10) ──
  { name: "Cafe Arábica Torrado 1kg", slug: "cafe-arabica-1kg", desc: "Cafe premium torrado artesanal", price: 8000, cmp: 12000, cond: "NEW", stock: 30, cat: "alimentos-bebidas", views: 112, img: "coffee-beans" },
  { name: "Cha Verde Organico 100g", slug: "cha-verde-organico", desc: "Cha verde folhas soltas organico", price: 5000, cmp: 8000, cond: "NEW", stock: 20, cat: "alimentos-bebidas", views: 67, img: "green-tea" },
  { name: "Chocolate Belga 70% 200g", slug: "chocolate-belga-70", desc: "Chocolate amargo belga premium", price: 6000, cmp: 9000, cond: "NEW", stock: 15, cat: "alimentos-bebidas", views: 89, img: "belgian-chocolate" },
  { name: "Vinho Tinto Reserva 750ml", slug: "vinho-tinto-reserva", desc: "Vinho tinto reserva envelhecido", price: 18000, cmp: 25000, cond: "NEW", stock: 10, cat: "alimentos-bebidas", views: 134, img: "red-wine" },
  { name: "Sumo Natural 1L 12 unidades", slug: "sumo-natural-1l-12un", desc: "Caixa sumo natural sem acucar", price: 9000, cmp: 12000, cond: "NEW", stock: 25, cat: "alimentos-bebidas", views: 98, img: "natural-juice" },
  { name: "Agua Mineral 500ml 24 pack", slug: "agua-mineral-500ml-24", desc: "Pack 24 garrafas 500ml", price: 4000, cmp: 6000, cond: "NEW", stock: 40, cat: "alimentos-bebidas", views: 145, img: "mineral-water" },
  { name: "Oleo de Palma Premium 5L", slug: "oleo-palma-premium-5l", desc: "Oleo de palma refino 5 litros", price: 7000, cmp: 10000, cond: "NEW", stock: 20, cat: "alimentos-bebidas", views: 123, img: "palm-oil" },
  { name: "Acucar Mascavo Organico 1kg", slug: "acucar-mascavo-1kg", desc: "Acucar mascavo organico", price: 4000, cmp: 6000, cond: "NEW", stock: 25, cat: "alimentos-bebidas", views: 54, img: "brown-sugar" },
  { name: "Cerveja Artisanal 330ml 6 pack", slug: "cerveja-artisanal-6pack", desc: "Pack 6 cervejas artesanais", price: 8000, cmp: 12000, cond: "NEW", stock: 15, cat: "alimentos-bebidas", views: 167, img: "craft-beer" },
  { name: "Mel Puro 500g", slug: "mel-puro-500g", desc: "Mel puro colmeia sem aditivos", price: 6000, cmp: 9000, cond: "NEW", stock: 18, cat: "alimentos-bebidas", views: 76, img: "pure-honey" },

  // ── Infantil (10) ──
  { name: "Carrinho de Bebè Graco", slug: "carrinho-bebe-graco", desc: "Carrinho 3 em 1 GracoModes", price: 85000, cmp: 105000, cond: "NEW", stock: 3, cat: "infantil", views: 134, img: "baby-stroller" },
  { name: "Cadeira de Alimentacao Bebe", slug: "cadeira-alimentacao-bebe", desc: "Cadeira regulavel dobravel", price: 25000, cmp: 32000, cond: "NEW", stock: 6, cat: "infantil", views: 98, img: "baby-high-chair" },
  { name: "Brinquedo Educativo Montessori", slug: "brinquedo-montessori", desc: "Kit 6 brinquedos Montessori", price: 15000, cmp: 22000, cond: "NEW", stock: 10, cat: "infantil", views: 156, img: "montessori-toys" },
  { name: "Roupa Bebe Kit 5 pecas", slug: "roupa-bebe-kit-5pecas", desc: "Kit 5 pecas recem-nascido", price: 12000, cmp: 18000, cond: "NEW", stock: 15, cat: "infantil", views: 112, img: "baby-clothes" },
  { name: "Bebedoras Avent 340ml 2 pack", slug: "bebedoras-avent-340ml", desc: "Bebedoras anti-colic Avent", price: 8000, cmp: 12000, cond: "NEW", stock: 20, cat: "infantil", views: 87, img: "baby-bottles" },
  { name: "Boneca Barbie Dreamhouse", slug: "boneca-barbie-dreamhouse", desc: "Casas da Barbie 3 andares", price: 35000, cmp: 45000, cond: "NEW", stock: 5, cat: "infantil", views: 189, img: "barbie-dollhouse" },
  { name: "Lego Classic 10696", slug: "lego-classic-10696", desc: "Kit LEGO 484 pecas medias", price: 22000, cmp: 28000, cond: "NEW", stock: 8, cat: "infantil", views: 178, img: "lego-set" },
  { name: "Estojo Escolar Hello Kitty", slug: "estojo-hello-kitty", desc: "Estojo completo Hello Kitty", price: 5000, cmp: 8000, cond: "NEW", stock: 12, cat: "infantil", views: 98, img: "pencil-case" },
  { name: "Tablet Crianca Educativo", slug: "tablet-crianca-edu", desc: "Tablet com jogos educativos", price: 25000, cmp: 35000, cond: "NEW", stock: 6, cat: "infantil", views: 123, img: "kids-tablet" },
  { name: "Carrinho Controlo Remoto 4x4", slug: "carrinho-rc-4x4", desc: "Carro RC off-road 2.4GHz", price: 18000, cmp: 25000, cond: "NEW", stock: 8, cat: "infantil", views: 167, img: "rc-car-toy" },

  // ── Animais de Estimacao (10) ──
  { name: "Racao Premium Cao 15kg", slug: "racao-premium-cao-15kg", desc: "Racao premium para caes adultos", price: 15000, cmp: 20000, cond: "NEW", stock: 20, cat: "animais-estimacao", views: 112, img: "dog-food" },
  { name: "Cama Elegante Gato", slug: "cama-elegante-gato", desc: "Cama redonda pelucia macia", price: 12000, cmp: 18000, cond: "NEW", stock: 10, cat: "animais-estimacao", views: 87, img: "cat-bed" },
  { name: "Aquario 60L Kit Completo", slug: "aquario-60l-kit", desc: "Aquario com filtro e LED", price: 35000, cmp: 45000, cond: "NEW", stock: 4, cat: "animais-estimacao", views: 76, img: "fish-aquarium" },
  { name: "Gaiola Passaro Grande", slug: "gaiola-passaro-grande", desc: "Gaiola espacosa com poleiro", price: 18000, cmp: 25000, cond: "NEW", stock: 6, cat: "animais-estimacao", views: 54, img: "bird-cage" },
  { name: "Coleira Anti-pulgas LED", slug: "coleira-antipulgas-led", desc: "Coleira LED recarregavel", price: 8000, cmp: 12000, cond: "NEW", stock: 15, cat: "animais-estimacao", views: 134, img: "led-collar-dog" },
  { name: "Transportador Viagem Cao", slug: "transportador-viagem-cao", desc: "Caixa transporte IATA aprovada", price: 22000, cmp: 30000, cond: "NEW", stock: 5, cat: "animais-estimacao", views: 98, img: "pet-carrier" },
  { name: "Dispensador Automático Racao", slug: "dispensador-auto-racao", desc: "Dispensador programmavel 5kg", price: 15000, cmp: 22000, cond: "NEW", stock: 8, cat: "animais-estimacao", views: 112, img: "auto-pet-feeder" },
  { name: "Filtro Canister 300L/h", slug: "filtro-canister-300l", desc: "Filtro externo para aquario", price: 18000, cmp: 25000, cond: "NEW", stock: 6, cat: "animais-estimacao", views: 67, img: "aquarium-filter" },
  { name: "Shampoo Hipoalergenico Cao", slug: "shampoo-hipoalerg-cao", desc: "Shampoo 500ml para pelagem", price: 5000, cmp: 8000, cond: "NEW", stock: 20, cat: "animais-estimacao", views: 89, img: "dog-shampoo" },
  { name: "Brinquedo Rope Interactivo", slug: "brinquedo-rope-interact", desc: "Corda mordedura resistente", price: 3000, cmp: 5000, cond: "NEW", stock: 25, cat: "animais-estimacao", views: 76, img: "dog-rope-toy" },

  // ── Servicos (9) ──
  { name: "Pacote Fotografia Evento", slug: "pacote-fotografia-evento", desc: "5 horas de fotografia profissional", price: 85000, cmp: 110000, cond: "NEW", stock: 50, cat: "servicos", views: 145, img: "event-photography" },
  { name: "Consultoria Marketing Digital", slug: "consultoria-marketing-digital", desc: "Sessao 1h estrategia digital", price: 25000, cmp: 35000, cond: "NEW", stock: 50, cat: "servicos", views: 112, img: "digital-marketing" },
  { name: "Limpeza Residencial Premium", slug: "limpeza-residencial", desc: "Limpeza completa residencia", price: 15000, cmp: 22000, cond: "NEW", stock: 50, cat: "servicos", views: 167, img: "house-cleaning" },
  { name: "Aula Particular Ingles 1h", slug: "aula-particular-ingles", desc: "Aula 1-on-1 com nativo", price: 8000, cmp: 12000, cond: "NEW", stock: 50, cat: "servicos", views: 134, img: "english-lesson" },
  { name: "Manutencao Computador Domicilio", slug: "manutencao-pc-domicilio", desc: "Diagnostico e reparacao PC", price: 12000, cmp: 18000, cond: "NEW", stock: 50, cat: "servicos", views: 98, img: "computer-repair" },
  { name: "Instalacao Ar Condicionado", slug: "instalacao-ac", desc: "Servico de instalacao AC", price: 25000, cmp: 35000, cond: "NEW", stock: 50, cat: "servicos", views: 87, img: "ac-installation" },
  { name: "Traducao Documentos EN/PT", slug: "traducao-docs-enpt", desc: "Traducao juramentada por pagina", price: 5000, cmp: 8000, cond: "NEW", stock: 50, cat: "servicos", views: 76, img: "document-translation" },
  { name: "Design Logo e Identidade", slug: "design-logo-identidade", desc: "Pacote logo + cartao + papelaria", price: 45000, cmp: 60000, cond: "NEW", stock: 50, cat: "servicos", views: 123, img: "logo-design" },
  { name: "Transporte Mudanca Completa", slug: "transporte-mudanca", desc: "Mudanca residencial porte medio", price: 65000, cmp: 85000, cond: "NEW", stock: 50, cat: "servicos", views: 156, img: "moving-service" },
];

async function main() {
  console.log("Seeding database...");

  // Admin
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@pambala.ao" },
    update: {},
    create: { email: "admin@pambala.ao", name: "Administrador", password: adminPassword, role: "ADMIN" },
  });
  console.log("Admin:", admin.email);

  // Categories
  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const ex = await prisma.category.findUnique({ where: { slug: c.slug } });
    if (ex) { catMap[c.slug] = ex.id; }
    else {
      const created = await prisma.category.create({ data: { name: c.name, slug: c.slug, icon: c.icon } });
      catMap[c.slug] = created.id;
    }
  }
  console.log("Categories:", Object.keys(catMap).length);

  // Sellers + Stores
  const storeMap: Record<string, string> = {};
  const pw = await bcrypt.hash("seller123", 10);
  for (const s of sellers) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, name: s.name, password: pw, role: "SELLER", phone: s.phone },
    });
    const store = await prisma.store.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        name: s.store, slug: s.storeSlug, description: s.desc,
        phone: s.phone, province: "Luanda", district: "Ingombota",
        userId: user.id, isVerified: true, rating: 4.5,
        logo: img(`store-${s.storeSlug}`),
        banner: img(`banner-${s.storeSlug}`),
        paymentMethods: JSON.stringify([
          { type: "EXPRESS", enabled: true, phone: s.phone },
          { type: "TRANSFER", enabled: true, phone: s.phone, ownerName: s.name, bankName: "BAI", iban: "AO06000000000000000000001", bankAccount: "123456789" },
          { type: "REFERENCE", enabled: true, entity: "12345", reference: "000 123 456" },
          { type: "CASH_ON_DELIVERY", enabled: true },
        ]),
      },
    });
    storeMap[s.storeSlug] = store.id;
    console.log("Store:", store.name);
  }

  // Buyers
  const buyerPw = await bcrypt.hash("buyer123", 10);
  const buyerNames = ["Pedro Jose", "Rosa Maria", "Antonio Fernandes", "Lucia Santos", "Manuel Costa"];
  const buyerIds: string[] = [];
  const buyerPhones = ["+244940111222", "+244941222333", "+244942333444", "+244943444555", "+244944555666"];
  for (let i = 0; i < buyerNames.length; i++) {
    const b = await prisma.user.upsert({
      where: { email: `comprador${i + 1}@pambala.ao` },
      update: {},
      create: {
        email: `comprador${i + 1}@pambala.ao`,
        name: buyerNames[i],
        password: buyerPw,
        role: "BUYER",
        phone: buyerPhones[i],
      },
    });
    buyerIds.push(b.id);
  }
  console.log("Buyers:", buyerIds.length);

  // Products
  const storeIds = Object.values(storeMap);
  let created = 0;
  for (const p of all) {
    const exists = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (exists) continue;
    const storeId = storeIds[created % storeIds.length];
    await prisma.product.create({
      data: {
        name: p.name, slug: p.slug, description: p.desc,
        price: p.price, comparePrice: p.cmp ?? null,
        images: JSON.stringify([img(p.img)]),
        condition: p.cond, stock: p.stock,
        categoryId: catMap[p.cat], storeId,
        views: p.views,
        isActive: true,
      },
    });
    created++;
  }
  console.log("Products created:", created);

  // Some reviews
  const products = await prisma.product.findMany({ take: 30 });
  const comments = [
    "Produto excelente, recomendo!",
    "Muito bom, chegou rapidamente.",
    "Qualidade top, vale o preco.",
    "Estou muito satisfeito com a compra.",
    "Entrega foi rapida e o produto e incrivel.",
    "Bom produto, embalagem cuidada.",
    "Superou as minhas expectativas.",
    "Produto original, recomendado.",
    "Servico de entrega muito bom.",
    "Voltarei a comprar sem duvida.",
  ];
  let reviewsCreated = 0;
  for (const prod of products) {
    const numReviews = 1 + Math.floor(Math.random() * 3);
    for (let r = 0; r < numReviews && reviewsCreated < 50; r++) {
      const buyerId = buyerIds[r % buyerIds.length];
      const exists = await prisma.review.findUnique({
        where: { userId_productId: { userId: buyerId, productId: prod.id } },
      });
      if (exists) continue;
      await prisma.review.create({
        data: {
          rating: 3 + Math.floor(Math.random() * 3),
          comment: comments[Math.floor(Math.random() * comments.length)],
          userId: buyerId, productId: prod.id, storeId: prod.storeId,
        },
      });
      reviewsCreated++;
    }
  }
  console.log("Reviews created:", reviewsCreated);

  // Update store ratings
  for (const sId of storeIds) {
    const revs = await prisma.review.findMany({ where: { storeId: sId } });
    if (revs.length > 0) {
      const avg = revs.reduce((s, r) => s + r.rating, 0) / revs.length;
      await prisma.store.update({ where: { id: sId }, data: { rating: Math.round(avg * 10) / 10 } });
    }
  }

  console.log("Seeding completed!");
}

main()
  .catch((e) => { console.error("Seed error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
