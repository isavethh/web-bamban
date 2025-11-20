'use strict';
const MANIFEST = 'flutter-app-manifest';
const TEMP = 'flutter-temp-cache';
const CACHE_NAME = 'flutter-app-cache';

const RESOURCES = {".git/COMMIT_EDITMSG": "90df28d59b57a8a8b7fe45b6815ea701",
".git/config": "9afcc6c9503b93736fe7c3dd3d2f8b8f",
".git/description": "a0a7c3fff21f2aea3cfa1d0316dd816c",
".git/FETCH_HEAD": "91de7b875961cf7953c60be148eef74d",
".git/HEAD": "cf7dd3ce51958c5f13fece957cc417fb",
".git/hooks/applypatch-msg.sample": "ce562e08d8098926a3862fc6e7905199",
".git/hooks/commit-msg.sample": "579a3c1e12a1e74a98169175fb913012",
".git/hooks/fsmonitor-watchman.sample": "a0b2633a2c8e97501610bd3f73da66fc",
".git/hooks/post-update.sample": "2b7ea5cee3c49ff53d41e00785eb974c",
".git/hooks/pre-applypatch.sample": "054f9ffb8bfe04a599751cc757226dda",
".git/hooks/pre-commit.sample": "5029bfab85b1c39281aa9697379ea444",
".git/hooks/pre-merge-commit.sample": "39cb268e2a85d436b9eb6f47614c3cbc",
".git/hooks/pre-push.sample": "2c642152299a94e05ea26eae11993b13",
".git/hooks/pre-rebase.sample": "56e45f2bcbc8226d2b4200f7c46371bf",
".git/hooks/pre-receive.sample": "2ad18ec82c20af7b5926ed9cea6aeedd",
".git/hooks/prepare-commit-msg.sample": "2b5c047bdb474555e1787db32b2d2fc5",
".git/hooks/push-to-checkout.sample": "c7ab00c7784efeadad3ae9b228d4b4db",
".git/hooks/sendemail-validate.sample": "4d67df3a8d5c98cb8565c07e42be0b04",
".git/hooks/update.sample": "647ae13c682f7827c22f5fc08a03674e",
".git/index": "44731c86eaed2bb8511d4a959c35bc2a",
".git/info/exclude": "036208b4a1ab4a235d75c181e685e5a3",
".git/logs/HEAD": "77295df9638eb93c67a74b79988cba03",
".git/logs/refs/heads/main": "77295df9638eb93c67a74b79988cba03",
".git/logs/refs/remotes/origin/HEAD": "27d931925b217d6996113f2f00e56715",
".git/logs/refs/remotes/origin/main": "b686d28f02dd9df7cba5d808e648d241",
".git/objects/16/e87715fb95fe3afb05e0828ffd91380e094cc8": "6461c03084c469ed9dcf91ecff3e4dff",
".git/objects/18/50ba3acb49a7be79c543b218884931fc0807f3": "469a3bac460cb68cdba683a4829730d7",
".git/objects/1b/6948c584f32673b5fae3a10e966dee3fe8d9e9": "f5a47aacf16f6014ec766de966a1675d",
".git/objects/1b/d0d37c273613220d8bdb1ccd4d7e7e715ae40e": "a7ff2b35d0ed2452805ac29c678250ee",
".git/objects/1c/d44a494b376467468a56b128eebec9b6d07585": "f896b624bbced1a380e5b906cf6519e1",
".git/objects/29/591e3ce2db6abcede4cee7a5e08de02b6cb484": "84a06fec81fdc4f1f9843a01bd29d330",
".git/objects/31/51516c386961212125a849cd33df5e6da195df": "314f717979d85e4c513798cc32bf5bbb",
".git/objects/38/37e81eae2e4bc57a4768d2feef0708435a1ef9": "9d9a5c5c09c7d11081a7e5e85b032cf9",
".git/objects/39/1e40d3091d8297718664ea74f60a11c1b724ae": "f032af0c5e3995ce0fecb617104c3308",
".git/objects/40/88d599eb169bf4ecfae942e7951e7f0e8c3492": "8c689c37fde3142c0a4af70f64f711f7",
".git/objects/46/e046eadbd59c28b9028846ddd9ed2653a47630": "99d22fc452765e4c5ec89f1d296ac594",
".git/objects/4a/1857fe73b374ea12c5d1bee0db09c6a6bb35d4": "fe3b9877d3b429231ce6faee124ddc16",
".git/objects/51/4d912e2cadc07f6e5024bf2abc77144c72a6c8": "23face332cee25c73856d5ab6cfa0190",
".git/objects/53/ba0d837e984b73791499dcaa8d9312f25a3849": "55df6d61db704ff7b00338ee3eab367e",
".git/objects/61/891b31433bc816d5168b4f34c3cb333121d5f7": "23241348f430ca0073936796ea0bad10",
".git/objects/63/469b955d03180eacc7cfdcbdff6db14f443d44": "d71bae1ac79b086ba668b06b22e54196",
".git/objects/6f/14ab3d1e9773a2d4a107a0c2a99725fb891c2d": "43672d2471648a2cc387db0bf69db9f6",
".git/objects/70/7adb9c8187c8d0057c40de5958863fb69aa3af": "4fe6f7188641701e4eabf536361c7d6b",
".git/objects/72/533dee83b794ace5f7904005cd275e26d9a953": "68771f08e97c7a97706ed1408215fca5",
".git/objects/7b/633913a18879699885d1d77df15226fd34978c": "f35f0673fd7a5a84307b69c3c378f956",
".git/objects/89/a2391edc230eae5e9dff1320b79a21566a0a93": "145a07c4e85c7a2c0f3a4b606db0da8d",
".git/objects/8b/7149f293cf0265fb1aec59316d86df02322833": "cb4ddd1fdff24f695757da2cfd94cb13",
".git/objects/8d/ae444274d62198ab3cfc3bc54231cdc82935da": "bcfde230bfef72c511f526c5e5a88be3",
".git/objects/9c/0bc8d9c4f5630bb6909941a47d0d4c1d49db0d": "4af9bd1b6944c4c03af76c53664f6f56",
".git/objects/a4/4f538917a45539934acbe3b4f239933f01ca54": "483944bb053d139181f78f6566058eb5",
".git/objects/aa/5947bb138aae0fb8cc67dd8d5eef39723b8458": "bba5e5d94ccfdd26a50c9a199eb78c62",
".git/objects/ac/4af3d46946d5629f363aedc943d65b737e9a82": "98efec738b78b45655325a3816aaa9f1",
".git/objects/b0/bb8b1500d5eddc19e4aefc7fb335b6e4b3bb8b": "fbfce63ea400125786d09b3c876735f5",
".git/objects/b5/c0f75275c8a434ac2a83d5b980f6d4c563efa9": "04bca4c8f7b1cebd0e9eb1baa461cae6",
".git/objects/b5/f6bf70480403d7c046506deb283d5d56691bd2": "4e5201f2686045db80095a508d1844ab",
".git/objects/b6/cd8827529405f2b05501c91ac315f135730c1b": "1535056875d5bef5d4fa595ef6195da2",
".git/objects/cc/aeadd1a2c52442fac868d1d1cac0c6a50abd86": "0350e4d04c8ff1b46f43ff8355a65032",
".git/objects/cf/9e68f4c8a7703b1831f4cde33dabfcecb74600": "d8321f442a53a90989e57cb9aebc4392",
".git/objects/d2/a753144eb2fa0396b37a51f0067313b97280a5": "6eae8a7f8677ce55cd49c1f0204a0907",
".git/objects/df/14691c3c3c0a62133c31bf43e915f5e82a1c3f": "c058b1ef33c9c8cb35df153e5ce2af5e",
".git/objects/df/76e6acf397791c3f264225dc90cd7f4f34b06a": "fa5471411365c5cd39c7518228755724",
".git/objects/e1/2945ca51d48a7bd52da0c12beb4a54fdd7643d": "6261ef7d7e354270ea0d2f0c67c6ad73",
".git/objects/e5/150e0ab8048f60b9fa0c85f9983cfaf61eaffd": "e9fdde7bdef03d50880fda6082521ee1",
".git/objects/e5/5451f0f6f50f0fd9fb12c5d22a9cfdd5989a4f": "cf5e3fedf766c4e58405c18998636a21",
".git/objects/eb/42463722775239f8bd8d9ecc992e9680c55ccb": "91a42d8eefc7edd7a7f6edb25620c43b",
".git/objects/f9/321f7894044f98e066bd1cc3991f4564d4b629": "506c2fd8827a08caf07a65d39747fbdf",
".git/objects/pack/pack-53c430651adfc542c58883944887511c9b4353e1.idx": "c62a6596c7f13d948fae8ebbd7bc8a55",
".git/objects/pack/pack-53c430651adfc542c58883944887511c9b4353e1.pack": "c3c52c22d32ef29cd6dc40c8b7bcf1c4",
".git/objects/pack/pack-53c430651adfc542c58883944887511c9b4353e1.rev": "0e4b3034cf7bc52f6c6d676e02961a0e",
".git/ORIG_HEAD": "f776a6ad69e0c8ad988a5d6802e7939e",
".git/packed-refs": "22aa16a61f28f3598a2233a67127e902",
".git/refs/heads/main": "f776a6ad69e0c8ad988a5d6802e7939e",
".git/refs/original/refs/heads/main": "61466eb1539924e6cb92b82cb5fd9fa2",
".git/refs/original/refs/remotes/origin/main": "933ef212a192f4daea81cfdc10f25970",
".git/refs/remotes/origin/HEAD": "98b16e0b650190870f1b40bc8f4aec4e",
".git/refs/remotes/origin/main": "f776a6ad69e0c8ad988a5d6802e7939e",
"assets/AssetManifest.bin": "b38a81624ce307bd8439311ac2c3cf99",
"assets/AssetManifest.bin.json": "467a9fe5364538e633ced9e0e38b18f9",
"assets/AssetManifest.json": "4d28b02ea64f677a4daf65907c71a562",
"assets/assets/images/bamban_logo.png": "f1a465a1b31425f71e463c81d4000514",
"assets/FontManifest.json": "5a32d4310a6f5d9a6b651e75ba0d7372",
"assets/fonts/MaterialIcons-Regular.otf": "00830095e6a4d136f1ab7b4761f079a6",
"assets/lib/external/Beni.xlsx": "c98f45ca6fc193cf45f1db347e3979cc",
"assets/lib/external/Chuquisaca.xlsx": "3e3df0a5e88df9196b9502c50f395c96",
"assets/lib/external/Cochabamba.xlsx": "e62ed0c327e1154c2ecbdac7e7d497c1",
"assets/lib/external/empresas.xlsx": "c92fc6497bf3f68cdf9e0a6b57b9c3c8",
"assets/lib/external/LaPaz.xlsx": "e194b56a6fa5ded76ec15f028e5fdf55",
"assets/lib/external/Oruro.xlsx": "f7f5fb2c9bbe9665fc1b6919e6e5542c",
"assets/lib/external/Pando.xlsx": "67af337d0b157fba40d84553f258ba2d",
"assets/lib/external/Potosi.xlsx": "d9ee992b13710a0021b567540d0eef67",
"assets/lib/external/SantaCruz.xlsx": "9a4c8fb0dc593dae3319564796db7aaf",
"assets/lib/external/Tarija.xlsx": "dffba24e167ae257bdf2aa11f165d00a",
"assets/NOTICES": "2d1c175a8cf9014f649efd6e7e437f12",
"assets/packages/cupertino_icons/assets/CupertinoIcons.ttf": "33b7d9392238c04c131b6ce224e13711",
"assets/packages/font_awesome_flutter/lib/fonts/fa-brands-400.ttf": "15d54d142da2f2d6f2e90ed1d55121af",
"assets/packages/font_awesome_flutter/lib/fonts/fa-regular-400.ttf": "262525e2081311609d1fdab966c82bfc",
"assets/packages/font_awesome_flutter/lib/fonts/fa-solid-900.ttf": "269f971cec0d5dc864fe9ae080b19e23",
"assets/shaders/ink_sparkle.frag": "ecc85a2e95f5e9f53123dcaf8cb9b6ce",
"canvaskit/canvaskit.js": "728b2d477d9b8c14593d4f9b82b484f3",
"canvaskit/canvaskit.js.symbols": "bdcd3835edf8586b6d6edfce8749fb77",
"canvaskit/canvaskit.wasm": "7a3f4ae7d65fc1de6a6e7ddd3224bc93",
"canvaskit/chromium/canvaskit.js": "8191e843020c832c9cf8852a4b909d4c",
"canvaskit/chromium/canvaskit.js.symbols": "b61b5f4673c9698029fa0a746a9ad581",
"canvaskit/chromium/canvaskit.wasm": "f504de372e31c8031018a9ec0a9ef5f0",
"canvaskit/skwasm.js": "ea559890a088fe28b4ddf70e17e60052",
"canvaskit/skwasm.js.symbols": "e72c79950c8a8483d826a7f0560573a1",
"canvaskit/skwasm.wasm": "39dd80367a4e71582d234948adc521c0",
"env.js": "29cd2ad7bb3b7e89c499448ddb2c1c09",
"favicon.png": "0f444e13bf0fe08fe4123302b689c46f",
"flutter.js": "83d881c1dbb6d6bcd6b42e274605b69c",
"flutter_bootstrap.js": "14322d56cfe857505567cdbee5c7624f",
"icons/Icon-192.png": "c812790a21ae7e2f9507a3e0ab2c8e20",
"icons/Icon-512.png": "aa349409882822bb196cca3003fdd5c6",
"icons/Icon-maskable-192.png": "c812790a21ae7e2f9507a3e0ab2c8e20",
"icons/Icon-maskable-512.png": "aa349409882822bb196cca3003fdd5c6",
"index.html": "949d3b9268331695f4b4fe213ebe5093",
"/": "949d3b9268331695f4b4fe213ebe5093",
"main.dart.js": "a948c9cfaaa665382203c16e095dffb1",
"manifest.json": "f69f80956a76b310d12d1152362166a2",
"version.json": "00a9928a70228a3bb8d9ea6260ae37ee"};
// The application shell files that are downloaded before a service worker can
// start.
const CORE = ["main.dart.js",
"index.html",
"flutter_bootstrap.js",
"assets/AssetManifest.bin.json",
"assets/FontManifest.json"];

// During install, the TEMP cache is populated with the application shell files.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});
// During activate, the cache is populated with the temp files downloaded in
// install. If this service worker is upgrading from one with a saved
// MANIFEST, then use this to retain unchanged resource files.
self.addEventListener("activate", function(event) {
  return event.waitUntil(async function() {
    try {
      var contentCache = await caches.open(CACHE_NAME);
      var tempCache = await caches.open(TEMP);
      var manifestCache = await caches.open(MANIFEST);
      var manifest = await manifestCache.match('manifest');
      // When there is no prior manifest, clear the entire cache.
      if (!manifest) {
        await caches.delete(CACHE_NAME);
        contentCache = await caches.open(CACHE_NAME);
        for (var request of await tempCache.keys()) {
          var response = await tempCache.match(request);
          await contentCache.put(request, response);
        }
        await caches.delete(TEMP);
        // Save the manifest to make future upgrades efficient.
        await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
        // Claim client to enable caching on first launch
        self.clients.claim();
        return;
      }
      var oldManifest = await manifest.json();
      var origin = self.location.origin;
      for (var request of await contentCache.keys()) {
        var key = request.url.substring(origin.length + 1);
        if (key == "") {
          key = "/";
        }
        // If a resource from the old manifest is not in the new cache, or if
        // the MD5 sum has changed, delete it. Otherwise the resource is left
        // in the cache and can be reused by the new service worker.
        if (!RESOURCES[key] || RESOURCES[key] != oldManifest[key]) {
          await contentCache.delete(request);
        }
      }
      // Populate the cache with the app shell TEMP files, potentially overwriting
      // cache files preserved above.
      for (var request of await tempCache.keys()) {
        var response = await tempCache.match(request);
        await contentCache.put(request, response);
      }
      await caches.delete(TEMP);
      // Save the manifest to make future upgrades efficient.
      await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
      // Claim client to enable caching on first launch
      self.clients.claim();
      return;
    } catch (err) {
      // On an unhandled exception the state of the cache cannot be guaranteed.
      console.error('Failed to upgrade service worker: ' + err);
      await caches.delete(CACHE_NAME);
      await caches.delete(TEMP);
      await caches.delete(MANIFEST);
    }
  }());
});
// The fetch handler redirects requests for RESOURCE files to the service
// worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  var origin = self.location.origin;
  var key = event.request.url.substring(origin.length + 1);
  // Redirect URLs to the index.html
  if (key.indexOf('?v=') != -1) {
    key = key.split('?v=')[0];
  }
  if (event.request.url == origin || event.request.url.startsWith(origin + '/#') || key == '') {
    key = '/';
  }
  // If the URL is not the RESOURCE list then return to signal that the
  // browser should take over.
  if (!RESOURCES[key]) {
    return;
  }
  // If the URL is the index.html, perform an online-first request.
  if (key == '/') {
    return onlineFirst(event);
  }
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) =>  {
      return cache.match(event.request).then((response) => {
        // Either respond with the cached resource, or perform a fetch and
        // lazily populate the cache only if the resource was successfully fetched.
        return response || fetch(event.request).then((response) => {
          if (response && Boolean(response.ok)) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    })
  );
});
self.addEventListener('message', (event) => {
  // SkipWaiting can be used to immediately activate a waiting service worker.
  // This will also require a page refresh triggered by the main worker.
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'downloadOffline') {
    downloadOffline();
    return;
  }
});
// Download offline will check the RESOURCES for all files not in the cache
// and populate them.
async function downloadOffline() {
  var resources = [];
  var contentCache = await caches.open(CACHE_NAME);
  var currentContent = {};
  for (var request of await contentCache.keys()) {
    var key = request.url.substring(origin.length + 1);
    if (key == "") {
      key = "/";
    }
    currentContent[key] = true;
  }
  for (var resourceKey of Object.keys(RESOURCES)) {
    if (!currentContent[resourceKey]) {
      resources.push(resourceKey);
    }
  }
  return contentCache.addAll(resources);
}
// Attempt to download the resource online before falling back to
// the offline cache.
function onlineFirst(event) {
  return event.respondWith(
    fetch(event.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch((error) => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response != null) {
            return response;
          }
          throw error;
        });
      });
    })
  );
}
