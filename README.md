# List.am VIN History

**Version 1.0.0** · Browser extension · [Հայերեն](#հայերեն) · [English](#english)

Ցույց է տալիս մեքենայի ԱՄՆ աճուրդային պատմությունը ([bid.cars](https://bid.cars/) կայքից) անմիջապես
[list.am](https://www.list.am/)-ի հայտարարության էջում՝ աճուրդի նկարները վաճառողի նկարների կողքին,
վնասվածքները, փաստաթղթի տեսակը, վազքը և այլն։

Shows a car's US auction history (from [bid.cars](https://bid.cars/)) right on its [list.am](https://www.list.am/)
listing page: auction photos next to the seller's photos, damage, title type, mileage and more.

---

## Հայերեն

### Ինչ է անում ընդլայնումը

Երբ բացում եք list.am-ում մեքենայի հայտարարություն, ընդլայնումը վերցնում է հայտարարության VIN կոդը, գտնում է
այդ մեքենան bid.cars կայքում (ԱՄՆ-ի մեքենաների աճուրդներ) և գտածը ցույց է տալիս նույն էջում։ Այլևս պետք չէ VIN
կոդը պատճենել և ձեռքով որոնել։

Օրինակ՝ 2021 թ. Jeep Compass-ի հայտարարության մեջ գրված է **«Չվթարված»**, բայց bid.cars-ի համաձայն մեքենան
2025-08-28-ին վաճառվել է ԱՄՆ աճուրդում՝ **առջևի մասի վնասվածքով** և **վթարված մեքենայի փաստաթղթով (salvage)**։

### Ինչ է փոխվում սովորական էջի համեմատ

**1. Նկարներ։** Սովորական էջում ձախում հայտարարության նկարներն են, աջում՝ վերնագիրը, գինը և վաճառողը։
Ընդլայնումով էջի վերևում **կողք կողքի** ցույց են տրվում list.am-ի նկարները և աճուրդի նկարները։ Վերնագիրը, գինը և
վաճառողի տվյալները իջնում են ներքև՝ մեքենայի տեղեկությունների կողքին։

| Սովորական էջ | Ընդլայնումով |
| --- | --- |
| ![Սովորական էջ](docs/images/1-photos-without-extension.jpg) | ![Ընդլայնումով](docs/images/2-photos-with-extension.jpg) |

**2. Մեքենայի տեղեկություններ։**
- Ավելանում է **«Auction history · bid.cars»** բաժինը՝ աճուրդ և լոտի համար, վաճառքի ամսաթիվ, վայր, վազք,
  վնասվածք, փաստաթղթի տեսակ, վաճառող, բանալի։ Կարևոր նախազգուշացումները ընդգծվում են կարմիրով։
- **VIN կոդը դառնում է հղում** դեպի bid.cars-ի էջը, և կողքին հայտնվում է կարմիր **«Auction history ↓»** նշանը։
- **«Վազք»** և **«Ներկա վիճակը»** դաշտերի տակ գրվում են աճուրդի տվյալները՝ կարմիրով, եթե դրանք հակասում են
  հայտարարությանը։

| Սովորական էջ | Ընդլայնումով |
| --- | --- |
| ![Սովորական տեղեկություններ](docs/images/3-car-info-without-extension.png) | ![Տեղեկություններ ընդլայնումով](docs/images/4-car-info-with-extension.png) |

Աճուրդի նկարի վրա սեղմելով այն բացվում է ամբողջ էկրանով, իսկ **Compare with list.am** կոճակը երկու կայքերի
նկարները ցույց է տալիս կողք կողքի։

---

### ⚠️ ԷՋԸ ՓՈՓՈԽՎՈՒՄ Է ՄԻԱՅՆ ԱՅՆ ԴԵՊՔՈՒՄ, ԵՐԲ ՀԱՅՏԱՐԱՐՈՒԹՅԱՆ ՄԵՋ ՆՇՎԱԾ Է VIN ԿՈԴԸ

| Հայտարարություն | Ինչ եք տեսնում |
| --- | --- |
| **VIN կոդը նշված է և գտնվել է bid.cars-ում** | **Էջը փոխվում է**, ինչպես ցույց է տրված վերևում։ |
| VIN կոդը նշված է, բայց bid.cars-ում **չի գտնվել** | Էջը **չի** փոխվում։ Նկարների տակ հայտնվում է միայն կանաչ տող *«No auction history found on bid.cars»*, իսկ VIN կոդը դառնում է հղում դեպի bid.cars-ի որոնումը։ |
| VIN կոդը սխալ է գրված | Էջը **չի** փոխվում։ Նկարների տակ հայտնվում է դեղին նախազգուշացում։ |
| **Հայտարարության մեջ VIN կոդ չկա** | **ԷՋԸ ԸՆԴՀԱՆՐԱՊԵՍ ՉԻ ՓՈՓՈԽՎՈՒՄ։** |

Փոփոխվում են միայն list.am-ի **մեքենաների հայտարարությունների էջերը**։ Որոնման և բաժինների էջերը, ինչպես նաև
bid.cars կայքը չեն փոփոխվում։

---

### Աջակցվող բրաուզերներ

Ընդլայնումն աշխատում է համակարգչի այն բրաուզերներում, որոնք կառուցված են Google Chrome-ի հիմքի վրա։

| Բրաուզեր | Աջակցում | Ընդլայնումների էջի հասցեն |
| --- | --- | --- |
| Brave | ✅ Այո (փորձարկված) | `brave://extensions` |
| Google Chrome | ✅ Այո | `chrome://extensions` |
| Microsoft Edge | ✅ Այո | `edge://extensions` |
| Opera | ✅ Այո | `opera://extensions` |
| Vivaldi | ✅ Այո | `vivaldi://extensions` |
| Arc, Yandex Browser | ✅ Պետք է աշխատի | իրենց ընդլայնումների էջը |
| Firefox | ❌ Ոչ | |
| Safari | ❌ Ոչ | |
| Հեռախոսի բրաուզերներ (Android / iOS) | ❌ Ոչ | |

Օգտագործեք բրաուզերի վերջին տարբերակը։

### Ինչպես ավելացնել ընդլայնումը բրաուզերում

Ընդլայնումը դեռ Chrome Web Store խանութում չէ, այդ պատճառով այն ավելացվում է ձեռքով։ Սա արվում է մեկ անգամ և
տևում է մոտ 2 րոպե։ Նկարները Brave բրաուզերից են, մյուս բրաուզերներում քայլերը նույնն են։

**Քայլ 1. Ներբեռնեք ընդլայնումը։** Այս էջի վերևում սեղմեք կանաչ **Code** կոճակը, ապա **Download ZIP**։ Բացեք
ներբեռնված ZIP ֆայլը (կրկնակի սեղմումով)։ Կստեղծվի թղթապանակ, որի ներսում կա **`extension`** թղթապանակը։

**Քայլ 2. Բացեք ընդլայնումների էջը։** Բրաուզերի վերևի աջ անկյունում սեղմեք մենյուի կոճակը **☰**, ապա
**Extensions → Manage extensions**։ Կամ հասցեի տողում գրեք `brave://extensions` (այլ բրաուզերների հասցեները
տես աղյուսակում)։

![Մենյու → Extensions → Manage extensions](docs/images/install-1-menu-extensions.png)

**Քայլ 3. Միացրեք «Developer mode»-ը։** Ընդլայնումների էջի վերևի աջ անկյունում միացրեք **Developer mode**
անջատիչը (Edge-ում այն ձախ մենյուում է)։

![Developer mode անջատիչ](docs/images/install-2-developer-mode.png)

**Քայլ 4. Ավելացրեք ընդլայնումը։** Կհայտնվեն նոր կոճակներ։ Սեղմեք **Load unpacked** և ընտրեք Քայլ 1-ում
բացված թղթապանակի ներսի **`extension`** թղթապանակը։

![Load unpacked կոճակ](docs/images/install-3-load-unpacked.png)

Ցուցակում կհայտնվի **List.am VIN History** ընդլայնումը։ Ցանկության դեպքում սեղմեք գործիքագոտու 🧩
պատկերակը և ամրացրեք 📌 այն, որպեսզի կոճակը միշտ երևա։

**Քայլ 5. Մեկ անգամ բացեք bid.cars-ը։** Նույն բրաուզերում բացեք [bid.cars](https://bid.cars/)։ Եթե կայքը
խնդրում է հաստատել, որ ռոբոտ չեք, հաստատեք։ Սա թույլ է տալիս ընդլայնմանը բեռնել աճուրդի նկարները։

**Քայլ 6. Պատրաստ է։** Բացեք list.am-ում ցանկացած մեքենայի հայտարարություն, օրինակ՝
<https://www.list.am/item/24173931>։

**Նոր տարբերակի թարմացում՝** ներբեռնեք նոր ZIP-ը, բացեք այն և փոխարինեք հին թղթապանակը նորով։ Ապա
ընդլայնումների էջում ընդլայնման վրա սեղմեք **⟳** (Reload) և թարմացրեք list.am-ի էջը։

**Հեռացում՝** ընդլայնումների էջում ընդլայնման վրա սեղմեք **Remove**։

### Լավ է իմանալ

- **Ընդլայնման կոճակը** գործիքագոտում ցույց է տալիս բաց էջի արդյունքը։ **Re-check** կոճակը նորից է ստուգում
  մեքենան, **Clear cache** կոճակը մոռանում է բոլոր նախկին արդյունքները։
- **Արդյունքները հիշվում են**, այդ պատճառով նույն հայտարարությունը կրկին բացելիս տվյալները հայտնվում են
  անմիջապես։ Գտնված մեքենաները հիշվում են 30 օր, չգտնվածները՝ 3 օր։
- **Երբեմն վերևում կարճ ժամանակով բացվում է bid.cars-ի նոր ներդիր** և ինքն իրեն փակվում։ Այդպես ընդլայնումը
  գտնում է մեքենան. ոչինչ անել պետք չէ։
- **Եթե bid.cars-ը խնդրում է հաստատել, որ ռոբոտ չեք,** ընդլայնումը ցույց է տալիս **Open bid.cars** հղումը։
  Բացեք այն, հաստատեք, ապա սեղմեք **Re-check**։
- **«Չի գտնվել»-ը ապացույց չէ**, որ մեքենան երբեք վթարված չի եղել. կան նաև այլ աճուրդներ և աղբյուրներ։
- **Գաղտնիություն։** Ընդլայնումը VIN կոդը որոնում է bid.cars կայքում։ Գրանցում պետք չէ։ Եթե միացնեք
  [տեղական MCP-ն](mcp/README.md), VIN կոդը, հայտարարության տվյալները և աճուրդի արդյունքը հասանելի կլինեն նաև ձեր ընտրած հավելվածում։

---

## English

### What the extension does

When you open a car listing on list.am, the extension takes the listing's VIN, finds that car on bid.cars
(US car auctions) and shows what it found on the same page. No more copying the VIN and searching by hand.

Example: a 2021 Jeep Compass is listed as **"Չվթարված" (not damaged)**, but bid.cars shows it was sold at a US
auction on 2025-08-28 with **front-end damage** and a **damaged-car title (salvage)**.

### What changes compared to the regular page

**1. Photos.** On the regular page the listing photos are on the left, and the title, price and seller are on the right.
With the extension, the top of the page shows the list.am photos and the auction photos **side by side**. The
title, price and seller move down next to the car information.

| Regular page | With the extension |
| --- | --- |
| ![Regular page](docs/images/1-photos-without-extension.jpg) | ![With the extension](docs/images/2-photos-with-extension.jpg) |

**2. Car information.**
- A new **"Auction history · bid.cars"** section: auction and lot number, sale date, location, mileage, damage,
  title type, seller and key. Important warnings are highlighted in red.
- The **VIN becomes a link** to the bid.cars page and gets a red **"Auction history ↓"** badge.
- The **mileage** and **condition** fields show the auction values underneath, in red when they contradict the
  listing.

| Regular page | With the extension |
| --- | --- |
| ![Regular car information](docs/images/3-car-info-without-extension.png) | ![Car information with the extension](docs/images/4-car-info-with-extension.png) |

Click an auction photo to open it full screen; **Compare with list.am** shows photos from both sites side by side.

---

### ⚠️ THE PAGE IS CHANGED ONLY WHEN THE LISTING HAS A VIN CODE

| Listing | What you see |
| --- | --- |
| **VIN is given and found on bid.cars** | **The page is changed** as shown above. |
| VIN is given but **not found** on bid.cars | The page is **not** changed. Only a slim green bar *"No auction history found on bid.cars"* appears under the photos, and the VIN becomes a link to the bid.cars search. |
| VIN is written incorrectly | The page is **not** changed. A yellow note appears under the photos. |
| **No VIN in the listing** | **THE PAGE IS NOT CHANGED AT ALL.** |

Only list.am **car listing pages** are changed. Search and category pages, and the bid.cars website itself, are
never changed.

---

### Supported browsers

The extension works in desktop browsers built on the same base as Google Chrome.

| Browser | Supported | Extensions page address |
| --- | --- | --- |
| Brave | ✅ Yes (tested) | `brave://extensions` |
| Google Chrome | ✅ Yes | `chrome://extensions` |
| Microsoft Edge | ✅ Yes | `edge://extensions` |
| Opera | ✅ Yes | `opera://extensions` |
| Vivaldi | ✅ Yes | `vivaldi://extensions` |
| Arc, Yandex Browser | ✅ Should work | their extensions page |
| Firefox | ❌ No | |
| Safari | ❌ No | |
| Phone browsers (Android / iOS) | ❌ No | |

Use the latest version of your browser.

### How to add the extension to the browser

The extension is not in the Chrome Web Store yet, so it is added by hand. You only do this once, and it takes about
2 minutes. The screenshots are from Brave; the steps are the same in the other browsers.

**Step 1. Download the extension.** At the top of this page click the green **Code** button, then
**Download ZIP**. Open the downloaded ZIP file (double-click). You get a folder with an **`extension`** folder
inside.

**Step 2. Open the extensions page.** Click the menu button **☰** in the top right corner of the browser, then
**Extensions → Manage extensions**. Or type `brave://extensions` in the address bar (addresses for other browsers
are in the table above).

![Menu → Extensions → Manage extensions](docs/images/install-1-menu-extensions.png)

**Step 3. Turn on "Developer mode".** In the top right corner of the extensions page, switch on **Developer mode**
(in Edge it is in the left menu).

![Developer mode switch](docs/images/install-2-developer-mode.png)

**Step 4. Add the extension.** New buttons appear. Click **Load unpacked** and select the **`extension`** folder
inside the folder you unzipped in step 1.

![Load unpacked button](docs/images/install-3-load-unpacked.png)

**List.am VIN History** appears in the list. Optionally, click the 🧩 icon in the toolbar and pin 📌 it so its
button is always visible.

**Step 5. Open bid.cars once.** In the same browser open [bid.cars](https://bid.cars/). If the site asks you to
confirm you are not a robot, confirm. This lets the extension load the auction photos.

**Step 6. Done.** Open any car listing on list.am, for example <https://www.list.am/item/24173931>.

**Update to a new version:** download the new ZIP, unzip it and replace the old folder with the new one. Then click
**⟳** (Reload) on the extension in the extensions page and refresh the list.am page.

**Remove:** click **Remove** on the extension in the extensions page.

### Good to know

- **The extension's button** in the toolbar shows the result for the open page. **Re-check** checks the car again,
  **Clear cache** forgets all earlier results.
- **Results are remembered,** so opening the same listing again shows the data instantly. Found cars are remembered
  for 30 days, not-found ones for 3 days.
- **Sometimes a bid.cars tab opens for a moment** at the top of the browser and closes by itself. That is how the
  extension finds the car; you don't need to do anything.
- **If bid.cars asks you to confirm you are not a robot,** the extension shows an **Open bid.cars** link. Open it,
  confirm, then click **Re-check**.
- **"Not found" is not proof** that the car was never damaged; other auctions and sources exist.
- **Privacy.** The extension searches bid.cars for the VIN. No registration is needed. The optional MCP shares
  the requested vehicle details and auction results with your chosen MCP client.

### Auction detective with MCP

Paste a VIN or List.am listing link into your assistant to see auction damage, title type, mileage, and photo
links. A listing check also compares the seller’s mileage and condition with the matching auction record.
[Set up the local MCP for Codex, Claude, Cursor, or Gemini CLI](mcp/README.md).

---

## Version history

**1.0.0, first version**
- Finds a list.am car's auction history on bid.cars by its VIN.
- Shows list.am and auction photos side by side, with full-screen view and comparison.
- Adds the auction details to the car information and highlights contradictions with the listing.
- Makes the VIN a link to bid.cars.

For developers: the extension code is in `extension/`, and the technical specification is in `spec/`.
