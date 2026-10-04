/* =====================================================================
 * LS Customs — catalogue de base + données de démonstration
 * Les données de démo sont produites en rejouant de vraies actions
 * (handle) : ventes, paies, stock et banque sont donc cohérents entre eux.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LSCSeed = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DAY = 864e5, HOUR = 36e5, MIN = 6e4;
  const iso = t => new Date(t).toISOString();
  const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  /* Grades : direction (PDG > Co-PDG > DRH) > Chef d'équipe > Recruteur > CDI > CDD > Apprenti (modifiables dans Rôles) */
  const P_APPRENTI = ['pos.use', 'sales.view_own', 'stats.own', 'service.self', 'stock.move'];
  const P_EMPLOYE = P_APPRENTI.concat(['pos.discount']);
  const P_CDI = P_EMPLOYE.concat(['pos.markup']);
  const P_RECRUTEUR = P_CDI.concat(['staff.view', 'staff.manage']);
  const P_CHEF = P_CDI.concat(['sales.view_all', 'stats.all', 'staff.view', 'warnings.manage', 'service.view_all']);
  const P_DRH = P_CHEF.concat(['staff.manage', 'staff.resetpwd', 'payroll.manage', 'audit.view']);
  const P_MANAGER = P_CHEF.concat(['pos.discount.unlimited', 'sales.cancel', 'accounting.view', 'invoices.manage', 'expenses.manage',
    'payroll.manage', 'bank.view', 'staff.manage', 'staff.resetpwd', 'products.manage', 'inventory.manage', 'partners.manage', 'audit.view']);
  const ROLES = [
    { id: 'apprenti', name: 'Apprenti', rank: 10, commission: 2, salary: 600, hourly: 20, perms: P_APPRENTI },
    { id: 'employe', name: 'CDD', rank: 20, commission: 5, salary: 900, hourly: 25, perms: P_EMPLOYE },
    { id: 'mecanicien', name: 'CDI', rank: 40, commission: 7, salary: 1200, hourly: 30, perms: P_CDI },
    { id: 'recruteur', name: 'Recruteur', rank: 45, commission: 7, salary: 1400, hourly: 32, perms: P_RECRUTEUR },
    { id: 'chef', name: "Chef d'équipe", rank: 50, commission: 10, salary: 1600, hourly: 35, perms: P_CHEF },
    { id: 'drh', name: 'DRH', rank: 70, commission: 8, salary: 2000, hourly: 38, perms: P_DRH },
    { id: 'manager', name: 'Co-PDG', rank: 90, commission: 8, salary: 2500, hourly: 40, perms: P_MANAGER },
    { id: 'patron', name: 'PDG', rank: 100, commission: 0, salary: 4000, hourly: 0, perms: ['*'] }
  ];
  /* Version 4 : nouveaux grades ; plus de clients ; factures = partenaires uniquement ;
   * stock, historique de stock et partenaires vidés. Appliquée une seule fois. */
  function layoutV4(db) {
    ROLES.forEach(r => {
      const ex = db.roles.find(x => x.id === r.id);
      if (ex) Object.assign(ex, { name: r.name, rank: r.rank, perms: r.perms.slice() });
      else db.roles.push(Object.assign({}, r, { perms: r.perms.slice() }));
    });
    ['customers', 'partners', 'invoices', 'bills', 'inventory', 'inventoryTx'].forEach(k => { db[k] = []; });
    (db.products || []).forEach(x => { x.inventoryId = null; });
    (db.sales || []).forEach(x => { if (x.status === 'pending') x.status = 'paid'; x.invoiceId = null; });
    db.notifications = (db.notifications || []).filter(n => !['bills', 'customers', 'partners', 'inventory', 'invoices'].includes(n.route));
    if (db.company) db.company.invoiceThreshold = 0;
    db.meta.seq.invoice = 0;
    db.meta.layout = 7;
    return db;
  }
  /* [id, nom, stock final démo, minimum, unité, coût] */
  const INVENTORY = [
    ['stk_pneu', 'Pneus', 8, 10, 'u', 45], ['stk_huile', 'Huile moteur', 120, 30, 'L', 4], ['stk_moteur', 'Kit moteur', 14, 5, 'u', 90],
    ['stk_repa', 'Kit de réparation', 22, 8, 'u', 60], ['stk_peinture', 'Peinture', 14, 5, 'pot', 70], ['stk_perf', 'Kit performance', 8, 3, 'u', 260],
    ['stk_frein', 'Disques de frein', 15, 5, 'u', 80], ['stk_amorti', 'Amortisseurs', 10, 4, 'u', 110], ['stk_film', 'Film teinté', 18, 5, 'rouleau', 35],
    ['stk_neon', 'Kit néons', 6, 3, 'u', 120]
  ];
  /* Catalogue LS Customs (images : img/products/<image>.png).
   * Les prix à 0 sont à définir depuis l'édition des produits.
   * [id, nom, catégorie, prix, coût, icône, article stock, conso, poids démo, image] */
  const PRODUCTS = [
    ['prd_depannage', 'Dépannage (/km)', 'services', 50, 10, 'truck', null, 1, 6, 'depannage-km'],
    ['prd_fourriere', 'Fourrière', 'services', 150, 30, 'circle-parking', null, 1, 4, 'fourriere'],
    ['prd_fourriere_air', 'Fourrière bateau / avion / hélico', 'services', 300, 60, 'ship', null, 1, 1, 'fourriere-bateau-avion-heli'],
    ['prd_nettoyage', 'Nettoyage', 'services', 50, 10, 'sparkles', null, 1, 6, 'nettoyage'],
    ['prd_karcher', 'Kärcher', 'services', 0, 0, 'droplets', null, 1, 0, 'karcher'],
    ['prd_carrosserie', 'Carrosserie', 'reparations', 50, 15, 'car-front', null, 1, 8, 'carrosserie'],
    ['prd_repa_complete', 'Réparation complète', 'reparations', 250, 90, 'wrench', 'stk_repa', 1, 6, 'reparation-complete'],
    ['prd_repa_moteur', 'Réparation moteur', 'reparations', 200, 90, 'cog', 'stk_moteur', 1, 5, 'reparation-moteur'],
    ['prd_pneu', 'Pneu', 'reparations', 100, 45, 'circle-dot', 'stk_pneu', 1, 6, 'pneu'],
    ['prd_kit_repa', 'Kit de réparation', 'reparations', 120, 60, 'package', 'stk_repa', 1, 3, 'kit-de-reparation'],
    ['prd_peinture_primaire', 'Peinture primaire', 'peinture', 0, 0, 'paintbrush', null, 1, 0, 'peinture-primaire'],
    ['prd_peinture_secondaire', 'Peinture secondaire', 'peinture', 0, 0, 'paintbrush', null, 1, 0, 'peinture-secondaire'],
    ['prd_nacrage', 'Effet de couleur - Nacrage', 'peinture', 0, 0, 'sparkle', null, 1, 0, 'effet-de-couleur-nacrage'],
    ['prd_couleur_roue', 'Couleur roue', 'peinture', 0, 0, 'circle-dot', null, 1, 0, 'couleur-roue'],
    ['prd_couleur_interieur', 'Couleur intérieur', 'peinture', 0, 0, 'armchair', null, 1, 0, 'couleur-interieur'],
    ['prd_couleur_tableau', 'Couleur tableau de bord', 'peinture', 0, 0, 'gauge', null, 1, 0, 'couleur-tableau-de-bord'],
    ['prd_couleur_phare', 'Couleur phare', 'peinture', 0, 0, 'lightbulb', null, 1, 0, 'couleur-phare'],
    ['prd_couleur_neon', 'Couleur néon', 'peinture', 0, 0, 'lightbulb', null, 1, 0, 'couleur-neon'],
    ['prd_couleur_fumee', 'Couleur fumée pneu', 'peinture', 0, 0, 'cloud', null, 1, 0, 'couleur-fumee-pneu'],
    ['prd_moteur', 'Moteur', 'performances', 0, 0, 'cog', null, 1, 0, 'moteur'],
    ['prd_neons', 'Néon', 'custom', 0, 0, 'lightbulb', 'stk_neon', 1, 0, 'neon'],
    ['prd_xenon', 'Phares au xénon', 'custom', 0, 0, 'sun', null, 1, 0, 'phares-au-xenon'],
    ['prd_roue_perso', 'Roue personnalisée', 'custom', 0, 0, 'disc', null, 1, 0, 'roue-personnalisee'],
    ['prd_type_roue', 'Type roue', 'custom', 0, 0, 'disc-3', null, 1, 0, 'type-roue'],
    ['prd_vitres', 'Teinte fenêtre', 'custom', 0, 0, 'sun-dim', 'stk_film', 1, 0, 'teinte-fenetre'],
    ['prd_plaque', 'Style de plaque', 'custom', 0, 0, 'rectangle-horizontal', null, 1, 0, 'style-de-plaque'],
    ['prd_klaxon', 'Klaxon', 'custom', 0, 0, 'megaphone', null, 1, 0, 'klaxon'],
    ['prd_extra', 'Extra', 'custom', 0, 0, 'plus', null, 1, 0, 'extra'],
    ['prd_custom_speciale', 'Custom Spéciale', 'custom', 0, 0, 'star', null, 1, 0, 'custom-speciale']
  ];
  /* Mot de passe des comptes de DÉMONSTRATION (mode local uniquement). À changer dans Mon compte. */
  const DEMO_PASSWORD = 'lscustoms';
  const DEMO_IDS = ['emp_michael', 'emp_thomas', 'emp_lucas', 'emp_sergio', 'emp_jessy', 'emp_kenny', 'emp_dylan'];
  /* Liste des véhicules (modèle -> catégorie 1 à 5) fournie par la direction.
   * Base de la table « Paramètres → Catégories de véhicules » (modifiable, import possible). */
  const VEHICLES = 'tenf:4,tenf2:5,r300:3,drafter:3,ninef:2,ninef2:2,alpha:1,ariant:1,banshee:2,bansheepo:2,bestiagts:2,buffaloh:3,calico:3,carbonizzare:2,comet2:2,callista:1,cometold:3,comet6:3,comet7:3,comet5:3,comet3:3,coquette:2,coquette4:4,corsita:4,cypher:3,cypherct:3,elegyheritage:3,elegyrh7:3,elegy2:2,elegy:3,estancia:4,euros:2,feltzer2:2,furoregt:2,fusilade:1,futo2:1,growler:3,hachurac:3,everon2:2,gauntlet6:2,howitzer2:2,imorgon:3,issi7:3,italigto:4,stingertt:3,italirsx:5,jester:2,jester2:2,jestgpr:3,jester4:3,jester3:3,jugular:3,kawaii:2,khamelion:2,komoda:3,kuruma:2,coureur:2,locust:2,lynx:2,massacro:2,massacro2:2,neo:4,neon:3,omnisegt:3,panthere:3,paragon:3,pariah:3,penumbra2:2,rt3000:2,raiden:3,raidenz:3,rapidgt2:2,rapidgt:2,remus:2,remusvert:2,revolter:3,roxanne:3,ruston:2,sm722:3,schafter4:2,schafter3:2,schlagen:3,gbschlagenr:3,schlagenstr:4,schwarzer:2,sentinel3:2,sentinel4:2,seven70:3,gbsolace:4,specter:4,specter2:4,stratumc:2,streiter2:3,sugoi:3,sultan3:3,sultan2:3,sunrise1:3,surano:1,turismoo:3,alphav:2,vstr:3,vectre:3,verlierer2:2,zr350:2,zrgpr:3,bansheeas:4,blista2:1,blista3:1,buffalo:1,buffalo2:3,comet4:2,flashgt:3,futo:1,gb200:3,hotring:2,gbmogulrs:3,omnis:2,penumbra:1,raptor:3,requiemzr1:3,streiter:2,sultan:1,tampa2:2,tropos:2,veto:1,veto2:1,pfister811:5,adder:5,autarch:5,banshee2:5,bullet:4,champion:5,cheetah:5,cyclone:5,deveste:5,sheava:3,emerus:5,entity3:5,entityxf:4,entity2:5,fmj:5,furia:5,gp1:5,ignus:5,infernus:3,italigtb:5,italigtb2:5,krieger:5,lm87:5,nero:5,nero2:5,osiris:5,penetrator:5,le7b:5,reaper:5,s80:4,sc1:4,sabot:4,sultanrs:3,supergts:4,t20:5,taipan:5,tempesta:4,tezeract:5,thrax:5,tigon:5,torero2:5,turismo3:5,turismor:5,tyrant:5,tyrus:5,vacca:4,vagner:5,virtue:4,visione:5,voltic:3,prototipo:5,xa21:5,zeno:5,zentorno:5,zorrusso:5,z190:3,ardent:4,brisket:2,cheetah2:4,coquette2:3,deimos:4,deluxo:4,dynasty:1,ferocid:2,btype2:3,infernus2:4,jb700:4,jb7002:4,nebula:1,peyote3:1,retinue2:1,btype3:3,stinger:3,stingergt:3,feltzer3:3,stromberg:4,toreador:4,torero:3,tornado:1,tornado2:1,tornado5:1,turismo2:5,viseris:3,ztype:3,aszr350:3,zion3:2,zodiacr:2,casco:3,cheburek:1,coquette5:3,fagaloa:1,fagaloac:1,gt500:3,mamba:2,manana:1,michelli:1,monroe:2,peyote:1,pigalle:2,rapidgt3:3,retinue:1,savestra:1,stingersc:1,swinger:4,tornado4:1,tornado3:1,tornado6:1,zodiac:1,zodiacc:2,admiral2:1,brigham2:1,vechampion:1,cinquemila:3,cognoscenti:1,cog55:1,deity:2,esperanto:1,esperanto2d:1,fugitive:1,glendale2:1,nebulaw:1,oraclev12:1,oraclev12w:1,primo:1,primo2:1,regina4:1,rhinehart:3,schafter2:1,scharmann:1,seraph:1,seraph10:3,stanier2:1,stretch:2,superd:1,superd3:2,surge:1,tailgater:1,tailgater2:2,torrence:1,vorschlaghammer:1,warrener2:1,asea2:1,asterope:1,asterope2:1,romero:1,emperor2:1,emperor:1,glendale:1,impaler5:1,ingot:1,intruder:1,oraclexsv12w:1,oraclexsv12:1,premier:1,primo3:1,regina:1,scheisser:1,stafford:1,stanier:1,stratum:1,warrener:1,washington:1,cogcabrio:1,exemplar:2,f620:1,fr36:3,kanjosj:1,postlude:1,previon:2,sentinel2:1,sentinelsg4:1,sentinel:1,windsor:2,windsor2:2,zion:1,zion2:1,felon:1,felon2:1,jackal:1,oracle:1,oracle2:1,dukes3:1,brigham:1,brisket3:1,broadway:1,buccaneer2:1,buffalo5:1,buffalo4:3,chino2:1,dominator7:3,domc:3,dominator9:3,dominator8:3,dominator3:3,ellie:3,eudora:1,faction2:1,faction3:1,gauntletc:2,gauntlet4:3,gauntlet3:1,gauntlet5:1,greenwood:1,hermes:1,impaler:1,manana2:1,moonbeam:1,moonbeam2:1,nightshade:2,peyote2:1,picadorl:1,ruiner4:3,sabregt2:1,savannasa:1,stallion4:1,tahoma:1,tampar:3,tulip2:1,vigero3r:3,jdvigeror:2,jdvigerord:2,vigeronew:2,vigero2:2,vigero3:3,voodoo3:1,voodoo:1,yosemite2:1,blade:1,buccaneer:1,chino:1,clique:1,clique2:1,coquette3:3,deviant:2,dominator:1,dominator10:1,dominator2:1,dukes:1,faction:1,gauntlet:1,gauntlet2:1,hotknife:1,hustler:1,impaler6:1,imperator:2,phoenix:1,picador:1,ratloader:1,ratloader2:1,ruiner:1,sabregt:1,slamvan:1,slamvan3:1,slamvan2:1,stallion:1,stalion2:2,tampa:1,tannen:2,tulip:1,vamos:1,vigero:1,virgo:1,virgo3:1,virgo2:1,voodoo2:1,vulture:1,weevil2:1,yosemite:1,alamo:1,alamo2:1,aleutian:2,astron:3,baller:1,baller2:1,baller3:2,baller4:2,baller7:2,baller8:2,cara:3,fxt1:1,dubsta22:2,everonb:3,executioner:1,granger2:2,vegranger:2,gresleyh:2,iwagen:2,issi8:2,jubilee:1,landstalker2:2,novak:3,patriot:1,patriotc:3,patriot2:2,rebla:3,rocoto:1,scout:2,scout20:2,seminole2:1,toros:4,xls:1,yosemiteswb:2,bjxl:1,cavalcade:1,cavalcade2:1,cavalcade3:1,contender:3,dorado:1,dubsta:1,dubsta2:1,fq2:1,granger:2,gresley:1,habanero:1,huntley:1,landstalker:1,mesa:1,radi:1,seminole:1,serrano:1,squaddie:1,vivanite:1,asbo:1,blista:1,kanjo:1,brioso3:1,brioso:1,club:1,issi2:1,panto:1,brioso2:1,dilettante2:1,issi5:1,issi4:1,issi3:1,prairie:1,rhapsody:1,shafie:1,weevil:1,17jamb:3,caracara2:3,bifta:1,blazer:1,blazer4:1,bodhi2:1,boor:1,brawler:2,brisket2:1,brutus:2,trophytruck2:2,contender2:3,coyote2:1,draugur:3,dubsta4x4:2,dubsta3:2,dune:1,dloader:1,dloader3:1,dloader4:1,everon:3,freecrawler:2,hellion:1,hellion2:1,blazer3:1,bfinjection:1,kalahari:1,kamacho:2,marshall:5,mesa3:1,mesaxl:2,monstrociti:1,outlaw:2,patriot3:4,patriots:2,rancherxl2:1,ratel:1,rebel2:1,rebel:1,riata:2,sandking2:1,sandking:1,sandstorm:3,hellenstorm:3,sandstormswb:3,sandstormxl:3,terminus:2,trophytruck:1,vagrant:3,verus:1,vigout:2,l35:1,l35s:1,winky:1,yosemite1500:1,yosemite3:1,akuma:1,bati701:1,bati:1,carbonrs:1,defiler:1,diablous:1,diablous2:1,double:1,faggio:1,faggio3:1,faggio2:1,frakas:1,hakuchou:1,hakuchou2:1,kunoichi:1,kusa:1,kuroi:1,lectro:1,nemesis:1,pcj:1,powersurge:1,rrocket:1,reever:1,ruffian:1,shinobi:1,stryder:1,thrust:1,vader:1,ventoso:1,vindicator:1,avarus:1,bf400:1,bagger:1,chimera:1,chimerac:1,cliffhanger:1,daemon2:1,daemon:1,deathbike:1,enduro:1,esskey:1,fcr:1,fcr2:1,gargoyle:1,golem1:1,hexer:1,hexerz:1,innovation:1,kampfer:1,krust:1,manchez:1,manchezbw:1,manchez2:1,manchez3:1,nightblade:1,nightblade2:1,ratbike:1,saltflat:1,sanchez2:1,sanchez:1,sanctus:1,slasher1:1,slave:1,sombrero:1,sovereign:1,spirit:1,templar:1,verin:1,vortex:1,wintergreen:1,wolfsbane:1,mx100jd:1,zombiea:1,zombieb:1,sidecarh2:1,ss550:1,burrito4:1,rumpoesc:1,imperialpas:1,minivan:1,minivan2:1,pony:1,pony2:1,rumpo:1,rumpo2:1,speedo:1,nspeedo:2,speedo5:1,speedo4:1,surfer3:1,speedo2:1,youga3:1,atlas:1,bison3:1,bison:1,bobcatxl:1,gburrito:1,gburrito2:1,journey2:1,paradise:1,rumpo3:1,speedo3:1,surfer:1,surfer2:1,youga:1,youga2:1,youga4:1,boxville:1,boxville2:1,boxville3:1,boxville4:1,boxville6:1,camper:1,journey:1,buzzard2:5,cargobob2:5,frogger2:5,havok:4,maverick:5,supervolito:5,supervolito2:5,swift:5,swift2:5,volatus:5,alphaz1:4,cuban800:5,dodo:5,duster:4,howard:5,luxor:5,luxor2:5,stunt:4,mammatus:5,nimbus:5,pyro:5,rogue:5,seabreeze:4,shamal:5,microlight:3,velum:5,velum2:5,vestra:5,avisa:3,dinghy:1,dinghy2:1,jetmax:1,longfin:1,marquis:1,tug:1,sr650fly:5,seashark:1,speeder:1,squalo:1,suntrap:1,toro2:1,tropic:1,rumpobox:1,benson:2,benson2:2,biff:1,hauler:1,mule:1,mule4:1,mule3:1,mule2:1,packer:2,phantom:2,phantom4:2,phantom3:2,pounder:2,caddyxl:1,muler:1,mower:1,caddy2:1,caddy:1,sadler:1,slamtruck:1,scrap:1,utillitruck2:1,utillitruck3:1,utillitruck:1,tractor3:1,tractor:1,guardian:3,mixer:1,mixer2:1,rubble:1,tiptruck:1,tiptruck2:1,openwheel1:5,openwheel2:5,vetir:1,niobe:4,paragon3:3,pipistrello:5,pizzaboy:1,castigator:3,envisage:3,eurosx32:4,sentinel6:1,youga5:1,everon3:3,jester5:3,rapidgt4:3,sentinel5:2,banshee3:3,astrale:3,itali2:4,cheetah3:4,fmj2:5,luiva:5,suzume:5,xtreme:5,keitora:1,chavosv6:2,hardy:1,tampa4:1,minimus:2,woodlander:2,coquette6:4,gt750:4,uranus:1,firebolt:2,l352:1,vivanite2:1,maverick2:5,duster2:4,bmx:1,cruiser:1,tribike2:1,fixter:1,scorcher:1,tribike3:1,tribike:1,segwayciv:1,gbadmiral:1,gbargento7fs:1,gbechelon:1,gbechelons:1,gbharmann:1,gbhedra:1,gbhedrakombi:1,gbimpaler:1,gbboxboy:1,gbboxboyft:1,gbesperta:1,gbsteedvan:1,gbsteedcrew:1,gbesurfer:1,gbsapphire:3,gbhades:2,gbhurricane:2,gbimpalerdlx:1,gbtahomagt:2,gbvigerorat:2,gberotiq:2,gbscoutgsx:2,gbtenfr:4,gbarcherpro2:3,gbargento2f:4,gbcomets2r:3,gbcyphergts:3,gbmochi:3,gbneonct:4,gbnexusrr:4,gbretinueloz:3,gbromulus:3,gbronin:3,gbrumina:3,gbschlagensp:3,gbschrauber:3,gbsentinelgts:3,gbsultanrsx:3,gbvivantgrb:3,btype:3,gbcometclf:3,gbcomets1t:3,gbcomets1tf:3,gbelegyrh2:3,gbkomodagt:3,gbraidillon:3,gbsidewinder:3,gbturismogt:5,gbturismogts:5,gbmugello:5,gb811s2:5,gbcheetahs:5,gbtempestafs:5,gbzeitgeist:5,gbterrorizer:2,gbbriosof:1,gbclubxr:1,gbirisz:1,gbissimetro:1,gbvivant:1,inductor:1,inductor2:1,gbbuffalohf:2,gbdomle:2,gbnobile:2,gbkisairs:3,gbshogun:3,gbtokage2:3,gbtokage:3,gbzr350:3,gbnexus1:4,gbtoreroxpr1:5,gbmeteor:5,gbcaracaragsx:3,gblaner4fh:1,gbzero:1,gbdice:1,gbemerus:5,akula:1,lspdalamo14:1,lspdalamo16:1,onxpolalamo2:1,onxpolalamo:1,lspdalamoold:1,onxpolaleu:1,ambulance:1,annihilator:1,annihilator2:1,trailersmall2:1,apc:1,scarab:1,armytanker:1,armytrailer:1,armytrailer2:1,avenger:1,avenger2:1,avenger3:1,avenger4:1,strikeforce:1,barracks:1,barracks3:1,barracks2:1,barrage:1,lspdbf400:1,onxpolbison:1,onxpolbison4:1,onxpolbison3:1,onxpolbison2:1,lspdbuffalo09:1,lspdbuffalo13:1,polbuffalo:1,onxpolbuffhf:1,onxpolbuff:1,polbuffalo6:1,lspdumkbuffstx:1,lspdumkbuffalo09:1,lspdumkbuff:1,policet3:1,lspdbus:1,polcaracara:1,onxpolcara:1,cargoplane:1,cargoplane2:1,onxpolcava:1,lspdcenturion:1,chernobog:1,onxpolcon:1,polcoquette4:1,crusader:1,poldominator10:1,onxpoldom:1,lspdumkdominator:1,onxpoldorado:1,poldorado:1,onxpoldorado2:1,lspdeveron:1,raiju:1,hunter:1,fbi:1,fbi2:1,firetruk:1,lspdfugitive:1,lspdfugitiveslick:1,lspdumkfugitive:1,scarab2:1,polgauntlet:1,onxpolgaunt:1,onxpolgrang:1,onxpolgrang2:1,lspdgrangertac:1,polgreenwood:1,halftrack:1,hydra:1,polimpaler6:1,polimpaler5:1,insurgent2:1,insurgent:1,insurgent3:1,minitank:1,onxpolinvict2:1,onxpolinvict:1,onxpolkandra:1,patrolboat:1,onxpolstalk:1,lspdumklandstalkerxl:1,starling:1,lguard:1,blazer2:1,lspdsadlerk9:1,mocpacker:1,lspdmav:1,polmav:1,menacer:1,onxpolmerit3:1,onxpolmerit:1,lspdumkmerit:1,onxpolmonar:1,lspdnewspeedo:1,scarab3:1,onxamblbarmdn1a:1,onxamblbarmdn1b:1,onxamblbarmdn1c:1,onxemslbarmdn1a:1,onxemslbarmdn1b:1,onxemslbarmdn1c:1,onxpollbarmdn1a:1,onxpollbarmdn1b:1,onxpollbarmdn1c:1,onxpollbarmdn2a:1,onxpollbarmdn3a:1,onxpollbarmdn3b:1,onxpollbaros1a:1,onxpollbaros2a:1,onxpollbaros2b:1,onxpollbaros3a:1,polfaction2:1,lazer:1,pranger:1,policeb:1,policeb2:1,police:1,police2:1,police3:1,predator:1,policeold1:1,riot:1,policeold2:1,policet:1,onxpolvstr:1,pbus:1,lspdraiden:1,riot2:1,onxpolregent:1,onxpolregentxl:1,rhino:1,lspdriot:1,bombushka:1,alkonost:1,sanchezbcso:1,onxpolsand:1,onxpolsandsc:1,onxpolsandh:1,onxpolsandxl:1,savage:1,lspdscorcher:1,lspdscout14:1,lspdscout16:1,lspdscout20:1,onxpolscout2:1,lspdscoutk9:1,onxpolscout:1,lspdumkscout16:1,onxpolsem:1,sheriff:1,sheriff2:1,lspdsovereign:1,lspdspeedo:1,lspdstanierk9:1,police5:1,lspdstanier:1,lspdstanierold:1,lspdstanierslick:1,lspdumkstanier98:1,lspdumkstanier08:1,lspdumkstanier:1,onxpoltavros:1,technical:1,technical2:1,technical3:1,onxpolterm2:1,polterminus:1,onxpolterm:1,lspdthrust:1,thruster:1,titan:1,titan2:1,khanjali:1,lspdtorrence:1,lspdoldtorrence:1,lspdtorrenceslick:1,lspdumktorrence:1,onxpoltulip:1,police4:1,molotok:1,valkyrie:1,lspdvalkyrie:1,valkyrie2:1,lspdverus:1,onxpolverus:1,onxpolvigero:1,lspdwash:1,lspdumkwash:1';
  const VEHICLES_V = 2; // +1 à chaque ajout de véhicules à la liste
  const vehicleTable = () => { const t = {}; VEHICLES.split(',').forEach(x => { const [m, n] = x.split(':'); t[m] = +n; }); return t; };
  const CATALOG_VERSION = 3;
  const imgPath = slug => 'img/products/' + slug + '.png';

  /* Base minimale : paramètres, grades, catalogue, inventaire (sans démo). */
  function base(S, opts) {
    const db = S.emptyDb();
    db.roles = ROLES.map(r => Object.assign({}, r, { perms: r.perms.slice() }));
    db.stockCats = [{ id: 'scat_pieces', name: 'Pièces & consommables', icon: 'package', webhook: '', createdAt: iso(Date.now()) }];
    db.inventory = INVENTORY.map(i => ({ id: i[0], name: i[1], qty: 0, min: i[3], unit: i[4], cost: i[5], categoryId: 'scat_pieces' }));
    db.products = PRODUCTS.map((p, i) => ({
      id: p[0], name: p[1], category: p[2], price: p[3], cost: p[4], icon: p[5], inventoryId: p[6], consume: p[7],
      description: '', image: imgPath(p[9]), visible: true, active: true, order: i + 1, createdAt: iso(Date.now())
    }));
    db.meta.catalog = CATALOG_VERSION;
    db.company.modelClasses = vehicleTable(); db.meta.vehiclesList = VEHICLES_V;
    if (opts && opts.owner) db.employees.push(Object.assign({ id: 'emp_owner', name: 'Patron', roleId: 'patron', status: 'off', archived: false, hiredAt: iso(Date.now()), promotions: [], lastLogin: null }, opts.owner));
    return db;
  }

  function build(S, opts) {
    opts = opts || {};
    if (opts.demo === false) return layoutV4(base(S, opts));
    const now = opts.now || Date.now();
    const db = base(S);
    let seed = 1487345;
    const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const run = (actor, action, payload, t) => S.handle(db, actor, action, payload, Math.min(t, now));
    const today = sod(now), t0 = today - 45 * DAY;

    [['emp_michael', 'Michael Carter', 'patron', '1002', '555-0101', 400], ['emp_thomas', 'Thomas Wilson', 'manager', '1088', '555-0144', 260],
      ['emp_lucas', 'Lucas Moretti', 'chef', '1310', '555-0172', 190], ['emp_sergio', 'Sergio Almada', 'employe', '1487', '555-1234', 120],
      ['emp_jessy', 'Jessy Ramos', 'mecanicien', '1523', '555-0190', 90], ['emp_kenny', 'Kenny Brooks', 'apprenti', '1641', '555-0123', 50],
      ['emp_dylan', 'Dylan Price', 'mecanicien', '1377', '555-0166', 150]
    ].forEach((e, i) => { const n = e[1].split(' '); db.employees.push({ id: e[0], name: e[1], firstName: n[0], lastName: n.slice(1).join(' '), charId: e[3], discordId: String(284019374512330000 + i * 7919133), bankAccount: 'LSB-' + e[3] + '-' + (4410 + i * 37), roleId: e[2], phone: e[4], status: 'off', archived: false, hiredAt: iso(t0 - e[5] * DAY), promotions: [], lastLogin: null }); });
    db.employees.forEach(e => { e.pinHash = S.config.hash(DEMO_PASSWORD); });

    [['John', 'Doe', '2041', '555-2041'], ['Maria', 'Lopez', '2177', '555-2177'], ['Tony', 'Vance', '2210', '555-2210'], ['Kim', 'Park', '2295', '555-2295'],
      ['Marcus', 'Hill', '2318', '555-2318'], ['Nina', 'Petrova', '2402', '555-2402'], ['Carlos', 'Mendez', '2456', '555-2456'], ['Ashley', 'Reed', '2519', '555-2519'],
      ['Omar', 'Haddad', '2603', '555-2603'], ['Lena', 'Fischer', '2688', '555-2688']
    ].forEach((c, i) => db.customers.push({ id: 'cus_' + c[2], firstName: c[0], lastName: c[1], playerId: c[2], phone: c[3], notes: '', createdAt: iso(t0 - (60 - i * 4) * DAY) }));

    db.partners.push(
      { id: 'par_benny', name: "Benny's Original Motor Works", type: 'garage', contact: 'Benny', phone: '555-0110', rate: 10, logo: '', notes: 'Sous-traitance carrosserie', prices: {}, createdAt: iso(t0) },
      { id: 'par_mors', name: 'Mors Mutual Insurance', type: 'assurance', contact: 'Service sinistres', phone: '555-0130', rate: 0, logo: '', notes: 'Tarifs négociés assurés', prices: { prd_repa_complete: 220, prd_carrosserie: 45, prd_depannage: 40 }, createdAt: iso(t0) },
      { id: 'par_pdm', name: 'Premium Deluxe Motorsport', type: 'concessionnaire', contact: 'Simeon', phone: '555-0150', rate: 5, logo: '', notes: '', prices: {}, createdAt: iso(t0) },
      { id: 'par_davis', name: 'Davis Towing', type: 'fourriere', contact: 'Dispatch', phone: '555-0170', rate: 0, logo: '', notes: '', prices: { prd_fourriere: 120 }, createdAt: iso(t0) },
      { id: 'par_postop', name: 'PostOP Logistics', type: 'transporteur', contact: 'Gestion de flotte', phone: '555-0180', rate: 8, logo: '', notes: '', prices: {}, createdAt: iso(t0) }
    );

    db.bank.push({ id: 'bnk_open', type: 'in', amount: 60000, category: 'apport', label: "Solde d'ouverture", ref: null, at: iso(t0 - DAY), by: 'emp_michael' });
    db.inventory.forEach(i => { i.qty = 150; });

    const weighted = (() => { const bag = []; PRODUCTS.forEach(p => { for (let i = 0; i < p[8]; i++) bag.push(p[0]); }); return () => pick(bag); })();
    const SELLERS = ['emp_sergio', 'emp_sergio', 'emp_lucas', 'emp_thomas', 'emp_jessy', 'emp_jessy', 'emp_kenny', 'emp_dylan'];

    for (let d = 45; d >= 0; d--) {
      const day = today - d * DAY;
      const sellers = SELLERS.filter(id => !(id === 'emp_dylan' && d < 10));
      if (d > 0) new Set(sellers).forEach(id => {
        if (rnd() < 0.55) { const st = day + (13 + rnd() * 4) * HOUR; run(id, 'service.start', {}, st); run(id, 'service.end', {}, st + (2 + rnd() * 4) * HOUR); }
      });
      const n = 3 + Math.floor(rnd() * 5) + (d < 7 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const t = day + (12 + rnd() * 10) * HOUR;
        if (t > now - 15 * MIN) continue;
        const seller = pick(sellers), chief = seller === 'emp_lucas' || seller === 'emp_thomas';
        const items = [];
        for (let j = 1 + Math.floor(rnd() * 3); j > 0; j--) items.push({ productId: weighted(), qty: rnd() < 0.2 ? 2 : 1 });
        const payment = pick(['card', 'card', 'card', 'cash', 'cash', 'company', 'invoice']);
        const p = { items, payment, customerId: chief && payment !== 'invoice' && rnd() < 0.15 ? null : pick(db.customers).id, partnerId: rnd() < 0.15 ? pick(db.partners).id : null };
        if (seller !== 'emp_kenny' && rnd() < 0.12) p.discount = { type: 'percent', value: 10, reason: 'Client fidèle' };
        if (chief && rnd() < 0.08) p.markup = { type: 'fixed', value: 100, reason: 'Intervention de nuit' };
        run(seller, 'pos.createSale', p, t);
      }
      if (d % 7 === 3) {
        const t = day + 10 * HOUR;
        run('emp_thomas', 'expenses.save', { category: 'moteur', qty: 2, description: 'Réassort moteurs', supplier: 'Parts LS', date: iso(t) }, t);
        run('emp_thomas', 'expenses.save', { category: 'kit_carro', qty: 6, description: 'Réassort kits carrosserie', supplier: 'Parts LS', date: iso(t) }, t);
        db.inventory.forEach(i => { if (i.qty < 120) run('emp_thomas', 'inventory.adjust', { id: i.id, kind: 'ajustement', qty: 150 - i.qty, reason: 'Réassort hebdomadaire' }, t + HOUR); });
      }
      if (d % 30 === 5) {
        const t = day + 11 * HOUR;
        run('emp_michael', 'expenses.save', { category: 'karcher', qty: 1, description: 'Kärcher atelier', supplier: 'Hardware LS', date: iso(t) }, t);
      }
    }

    /* factures POS réglées après quelques jours */
    db.invoices.filter(i => i.status === 'sent' && Date.parse(i.createdAt) < now - 4 * DAY).forEach(i => { if (rnd() < 0.85) run('emp_thomas', 'invoices.pay', { id: i.id, method: 'bank' }, Date.parse(i.createdAt) + 2 * DAY); });

    /* factures client manuelles */
    const inv = (to, label, price, due, t, then) => {
      const r = run('emp_thomas', 'invoices.save', { [to.startsWith('par_') ? 'partnerId' : 'customerId']: to, items: [{ label, price, qty: 1 }], due: iso(due), note: '' }, t);
      if (r.ok && then) then.forEach(a => run('emp_thomas', a, { id: r.data.id, method: 'bank' }, t + DAY));
    };
    inv('par_postop', 'Entretien flotte — 3 utilitaires', 1350, today + 5 * DAY, now - 2 * DAY, ['invoices.send']);
    inv('par_mors', 'Sinistres pris en charge — septembre', 2400, today - 3 * DAY, now - 12 * DAY, ['invoices.send']);
    inv('par_pdm', 'Préparation véhicules de démonstration', 800, today - 8 * DAY, now - 16 * DAY, ['invoices.send', 'invoices.pay']);
    inv('cus_2402', 'Customisation complète (grosse commande)', 4200, today + 10 * DAY, now - 3 * HOUR, null);

    /* factures fournisseurs */
    const bill = (supplier, ref, amount, due, t, paid) => {
      const r = run('emp_thomas', 'bills.save', { supplier, ref, amount, due: iso(due), category: 'fournisseurs' }, t);
      if (paid && r.ok) run('emp_thomas', 'bills.pay', { id: r.data.id }, paid);
    };
    bill('Parts LS', 'INV-38', 1800, today - 20 * DAY, now - 30 * DAY, now - 21 * DAY);
    bill('LS Water & Power', 'INV-40', 640, today - 9 * DAY, now - 18 * DAY, now - 10 * DAY);
    bill('Parts LS', 'INV-43', 2300, today - 2 * DAY, now - 12 * DAY, null);
    bill('Atomic Tyres', 'INV-44', 1250, today + 3 * DAY, now - 4 * DAY, null);
    bill("Benny's Original Motor Works", 'INV-42', 4500, today + 7 * DAY, now - 2 * DAY, null);

    /* avertissements */
    run('emp_thomas', 'warnings.save', { employeeId: 'emp_dylan', type: 'Comportement', reason: 'Altercation avec un client au comptoir.' }, now - 15 * DAY);
    run('emp_lucas', 'warnings.save', { employeeId: 'emp_kenny', type: 'Retard', reason: 'Arrivée 30 minutes après le début du service.' }, now - 6 * DAY);
    run('emp_lucas', 'warnings.save', { employeeId: 'emp_sergio', type: 'Non-respect des procédures', reason: 'Réparation effectuée sans enregistrement préalable de la vente.' }, now - 3 * DAY);

    /* paies : deux périodes versées, la période en cours en brouillon */
    const payPeriod = (from, to, payAt) => {
      run('emp_michael', 'payroll.generate', { from: iso(from), to: iso(to) }, payAt);
      db.payrolls.filter(x => x.status === 'draft').forEach(x => { run('emp_michael', 'payroll.validate', { id: x.id }, payAt); run('emp_michael', 'payroll.pay', { id: x.id }, payAt); });
    };
    payPeriod(today - 28 * DAY, today - 14 * DAY - 1, today - 14 * DAY + 10 * HOUR);
    run('emp_michael', 'staff.archive', { id: 'emp_dylan', reason: 'Démission' }, today - 10 * DAY + 9 * HOUR);
    payPeriod(today - 14 * DAY, today - 7 * DAY - 1, today - 7 * DAY + 10 * HOUR);
    run('emp_michael', 'payroll.generate', { from: iso(today - 7 * DAY), to: iso(now) }, now - 30 * MIN);
    const sergioPay = db.payrolls.find(x => x.employeeId === 'emp_sergio' && x.status === 'draft');
    if (sergioPay) run('emp_michael', 'primes.add', { employeeId: 'emp_sergio', amount: 200, reason: 'Prime qualité' }, now - 25 * MIN);

    /* demande de compte en attente de validation */
    S.register(db, { firstName: 'Jordan', lastName: 'Blake', charId: '3102', discordId: '', bankAccount: '', password: DEMO_PASSWORD }, now - 20 * MIN);

    /* absences de démonstration */
    run('emp_jessy', 'absences.save', { from: iso(today - DAY), to: iso(today + 2 * DAY), reason: 'Vacances' }, now - 3 * DAY);
    run('emp_thomas', 'absences.save', { employeeId: 'emp_kenny', from: iso(today - 9 * DAY), to: iso(today - 8 * DAY), reason: 'Absence non justifiée' }, now - 8 * DAY);

    /* inventaire physique : stock final de démonstration */
    INVENTORY.forEach(i => { const it = db.inventory.find(x => x.id === i[0]); if (it.qty !== i[2]) run('emp_michael', 'inventory.adjust', { id: it.id, kind: 'ajustement', qty: i[2] - it.qty, reason: 'Inventaire physique' }, now - 50 * MIN); });

    /* qui est en service maintenant */
    run('emp_thomas', 'service.start', {}, now - 192 * MIN);
    run('emp_lucas', 'service.start', {}, now - 130 * MIN);
    run('emp_lucas', 'service.pause', {}, now - 12 * MIN);
    run('emp_sergio', 'service.start', {}, now - 102 * MIN);
    run('emp_michael', 'staff.setStatus', { id: 'emp_kenny', status: 'suspended' }, now - 5 * HOUR);

    /* notifications de départ */
    const lastBig = db.notifications.filter(n => n.type === 'largeSale').pop();
    const notif = (type, title, body, level, route, ago, read) => ({ id: 'ntf_demo_' + type, type, title, body, level, route, at: iso(now - ago), read });
    db.notifications = [
      notif('service', 'Fin de service', 'Jessy Ramos a terminé son service (03h12)', 'info', 'service', 26 * HOUR, true),
      notif('payment', 'Paiement reçu', 'Facture FAC-0003 réglée par Kim Park', 'ok', 'invoices', 15 * DAY, true),
      lastBig ? Object.assign(lastBig, { read: true }) : null,
      notif('overdue', 'Facture en retard', 'Parts LS #INV-43 — $2,300 échue', 'danger', 'bills', 2 * HOUR, false),
      notif('lowStock', 'Stock faible', 'Pneus : 8 restants (minimum 10)', 'warn', 'inventory', 45 * MIN, false),
      notif('signup', 'Demande de compte', 'Jordan Blake (Char ID 3102) attend une validation', 'info', 'staff', 20 * MIN, false)
    ].filter(Boolean);

    ['audit', 'bank', 'inventoryTx'].forEach(k => db[k].sort((a, b) => a.at.localeCompare(b.at)));
    db.sessions.sort((a, b) => a.start.localeCompare(b.start));
    db.meta.balance = Math.round(db.bank.reduce((a, t) => a + (t.type === 'in' ? t.amount : -t.amount), 0) * 100) / 100;
    return layoutV4(db);
  }

  /* Mise à niveau non destructive d'une base existante vers le catalogue actuel :
   * ajoute les nouveaux articles, pose les images manquantes, regroupe les catégories.
   * Les prix déjà saisis ne sont jamais modifiés. Retourne true si la base a changé. */
  function migrate(db, S) {
    let changed = false;
    if (db && db.meta && (db.meta.layout || 0) < 4 && Array.isArray(db.roles)) { layoutV4(db); changed = true; }
    /* solde bancaire tenu dans meta (les anciennes opérations peuvent être archivées) */
    if (db && db.meta && typeof db.meta.balance !== 'number' && Array.isArray(db.bank)) {
      db.meta.balance = Math.round(db.bank.reduce((a, t) => a + (t.type === 'in' ? t.amount : -t.amount), 0) * 100) / 100; changed = true;
    }
    /* catégories de véhicules : table par modèle (apprise depuis l'historique) + classes GTA ; GLife */
    if (S && db && db.company && !db.company.gtaClasses) {
      const d = S.defaultCompany(), mc = {};
      (db.sales || []).forEach(x => { const v = x.vehicle; if (v && v.model && v.class && x.status !== 'cancelled') mc[v.model] = v.class; });
      Object.assign(db.company, { modelClasses: Object.assign(mc, db.company.modelClasses || {}), gtaClasses: d.gtaClasses, glifeCompanyId: d.glifeCompanyId });
      changed = true;
    }
    /* étapes du licenciement : Company, Discord, Compta (remplace l'ancienne liste par défaut) */
    if (S && db && db.company && (db.company.dismissChecklist || []).some(x => x.id === 'dc_job')) { db.company.dismissChecklist = S.defaultCompany().dismissChecklist; changed = true; }
    /* catégorie 0 -> 1 ; étapes du licenciement */
    if (db && db.meta && db.company && (db.meta.layout || 0) < 7) {
      const mc = db.company.modelClasses || {};
      Object.keys(mc).forEach(k => { if (!(mc[k] >= 1)) mc[k] = 1; });
      if (S && !db.company.dismissChecklist) db.company.dismissChecklist = S.defaultCompany().dismissChecklist;
      if ((db.meta.layout || 0) >= 6) { db.meta.layout = 7; changed = true; }
    }
    /* liste des véhicules de la direction : ajoutée à chaque nouvelle version de la liste (les catégories déjà saisies sont conservées) */
    if (db && db.meta && db.company && (db.meta.vehiclesList || 0) < VEHICLES_V) {
      db.company.modelClasses = Object.assign(vehicleTable(), db.company.modelClasses || {});
      const u = db.meta.unlisted || {}; Object.keys(u).forEach(k => { if (k in db.company.modelClasses) delete u[k]; });
      db.meta.vehiclesList = VEHICLES_V; changed = true;
    }
    /* v6 : réinitialisation des mots de passe (DRH, Co-PDG) */
    if (db && db.meta && (db.meta.layout || 0) < 6 && Array.isArray(db.roles)) {
      db.roles.forEach(r => { if (['drh', 'manager'].includes(r.id) && !r.perms.includes('staff.resetpwd')) r.perms.push('staff.resetpwd'); });
      if ((db.meta.layout || 0) >= 5) { db.meta.layout = 6; changed = true; }
    }
    /* v5 : Recruteur passe au-dessus de CDI */
    if (db && db.meta && (db.meta.layout || 0) < 5 && Array.isArray(db.roles)) {
      const r = db.roles.find(x => x.id === 'recruteur'), d = ROLES.find(x => x.id === 'recruteur');
      if (r && r.rank < 40) Object.assign(r, { rank: d.rank, perms: [...new Set(r.perms.concat(d.perms))] });
      db.meta.layout = 7; changed = true;
    }
    if (S && db && db.company && !Array.isArray(db.company.adverts)) { db.company.adverts = S.defaultCompany().adverts; changed = true; }
    if (S && db && db.company && !db.company.payrollRules) { db.company.payrollRules = S.defaultCompany().payrollRules; changed = true; }
    if (S && db && db.company && db.company.invoiceThreshold === undefined) {
      const d = S.defaultCompany();
      Object.assign(db.company, { invoiceThreshold: d.invoiceThreshold, directPayment: d.directPayment, vehicleClasses: d.vehicleClasses });
      (db.invoices || []).forEach(i => { if (!i.kind) i.kind = i.partnerId ? 'partner' : 'big'; });
      changed = true;
    }
    if (db && db.meta && !Array.isArray(db.absences)) { db.absences = []; changed = true; }
    /* recrutement retiré -> demandes de compte (inscription) */
    if (db && db.meta && !Array.isArray(db.signups)) {
      db.signups = [];
      delete db.applications;
      (db.roles || []).forEach(r => { r.perms = r.perms.filter(k => k !== 'recruit.manage'); });
      (db.notifications || []).forEach(n => { if (n.route === 'recruit') { n.route = ''; n.read = true; } });
      if (db.company && db.company.notify) { delete db.company.notify.application; db.company.notify.signup = true; }
      changed = true;
    }
    /* brouillons de paie d'employés archivés (correctif) */
    if (db && Array.isArray(db.payrolls)) {
      const gone = new Set((db.employees || []).filter(e => e.archived).map(e => e.id)), n = db.payrolls.length;
      db.payrolls = db.payrolls.filter(x => !(x.status === 'draft' && gone.has(x.employeeId)));
      if (db.payrolls.length !== n) changed = true;
    }
    /* connexion par mot de passe : comptes de démo sans mot de passe -> mot de passe de démo */
    if (S && db && db.employees) db.employees.forEach(e => { if (!e.pinHash && DEMO_IDS.includes(e.id)) { e.pinHash = S.config.hash(DEMO_PASSWORD); changed = true; } });
    /* frais = commandes uniquement (moteur, kit carrosserie, Kärcher) + primes */
    if (S && db && db.company && !db.company.primeRules) {
      const co = db.company, old = co.expenseCategories || [];
      (db.expenses || []).forEach(e => { if (!e.categoryLabel) e.categoryLabel = (old.find(k => k.id === e.category) || { label: e.category }).label; });
      co.expenseCategories = S.defaultCompany().expenseCategories;
      co.primeRules = S.defaultCompany().primeRules;
      changed = true;
    }
    if (db && db.meta && !Array.isArray(db.primes)) { db.primes = []; changed = true; }
    /* suivi de stock par catégories (webhooks Discord) */
    if (db && db.meta && !Array.isArray(db.stockCats)) {
      db.stockCats = [{ id: 'scat_pieces', name: 'Pièces & consommables', icon: 'package', webhook: '', createdAt: iso(Date.now()) }];
      (db.inventory || []).forEach(i => { if (!i.categoryId) i.categoryId = 'scat_pieces'; });
      (db.roles || []).forEach(r => { if (r.perms.includes('pos.use') && !r.perms.includes('stock.move')) r.perms.push('stock.move'); });
      changed = true;
    }
    /* comptes employés : prénom / nom / Char ID / Discord / compte bancaire */
    (db && db.employees || []).forEach(e => {
      if (e.firstName !== undefined) return;
      const n = String(e.name || '').split(' ');
      Object.assign(e, { firstName: n[0] || '', lastName: n.slice(1).join(' '), charId: e.charId || e.playerId || '', discordId: e.discordId || '', bankAccount: e.bankAccount || '' });
      changed = true;
    });
    if (!db || !db.meta || (db.meta.catalog || 1) >= CATALOG_VERSION) return changed;
    if ((db.meta.catalog || 1) >= 2) {
      /* v2 -> v3 : onglet Performances (selon la catégorie du véhicule) + sous-catégories */
      const co = db.company;
      co.categories.forEach(k => { if (!Array.isArray(k.subs)) k.subs = []; });
      if (!co.categories.some(k => k.vehicleClass)) {
        const at = co.categories.findIndex(k => k.id === 'custom');
        co.categories.splice(at < 0 ? co.categories.length : at, 0, { id: 'performances', label: 'Performances', icon: 'gauge', vehicleClass: true, subs: [] });
      }
      const m = db.products.find(x => x.id === 'prd_moteur');
      if (m && m.category === 'custom' && co.categories.some(k => k.id === 'performances')) m.category = 'performances';
      db.meta.catalog = CATALOG_VERSION;
      return true;
    }
    const co = db.company, defaults = [
      { id: 'services', label: 'Services', icon: 'truck' }, { id: 'reparations', label: 'Réparations', icon: 'wrench' },
      { id: 'peinture', label: 'Peinture & couleurs', icon: 'palette', subs: [] }, { id: 'performances', label: 'Performances', icon: 'gauge', vehicleClass: true, subs: [] },
      { id: 'custom', label: 'Customisation', icon: 'sparkles', subs: [] }];
    defaults.forEach(d => { if (!d.subs) d.subs = []; });
    const oldDefaults = ['services', 'pieces', 'reparations', 'custom', 'autres'];
    co.categories = defaults.concat((co.categories || []).filter(c => !oldDefaults.includes(c.id) && !defaults.some(d => d.id === c.id)));
    if (!co.logo) co.logo = 'img/logo.png';
    const ids = new Set(PRODUCTS.map(p => p[0]));
    PRODUCTS.forEach((p, i) => {
      const ex = db.products.find(x => x.id === p[0]);
      if (ex) {
        if (!ex.image) ex.image = imgPath(p[9]);
        if (ex.name === 'Néons' || ex.name === 'Vitres teintées') ex.name = p[1];
        ex.category = p[2]; ex.order = i + 1;
      } else db.products.push({ id: p[0], name: p[1], category: p[2], price: p[3], cost: p[4], icon: p[5], inventoryId: p[6], consume: p[7], description: '', image: imgPath(p[9]), visible: true, active: true, order: i + 1, createdAt: iso(Date.now()) });
    });
    let n = PRODUCTS.length;
    db.products.forEach(x => {
      if (ids.has(x.id)) return;
      /* anciens articles de démonstration hors catalogue : masqués du POS, pas supprimés */
      if (/^prd_(vidange|parallelisme|peinture|perf|freins|amortisseurs|gps)$/.test(x.id)) x.visible = false;
      if (!co.categories.some(c => c.id === x.category)) x.category = x.category === 'pieces' ? 'reparations' : 'custom';
      x.order = ++n;
    });
    db.meta.catalog = CATALOG_VERSION;
    return true;
  }

  return { build, base, migrate };
});
