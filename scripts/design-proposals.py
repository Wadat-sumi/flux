"""Original static design review drawings. No application UI is implemented here."""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parents[1] / 'docs/design'
OUT.mkdir(parents=True, exist_ok=True)

def rect(x, y, w, h, fill, r=0, stroke='none', sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'

def text(x, y, value, size=16, fill='#282730', weight=400, anchor='start'):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>'

def line(x1, y1, x2, y2, color, width=1, dash=''):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}" stroke-dasharray="{dash}"/>'

def path(d, color, width=1, fill='none', dash=''):
    return f'<path d="{d}" stroke="{color}" stroke-width="{width}" fill="{fill}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="{dash}"/>'

def circle(x, y, r, fill, stroke='none', sw=1):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'

def button(x, y, w, title, primary, fg, fill=None):
    return rect(x, y, w, 40, fill or primary, 8) + text(x+w/2, y+26, title, 14, fg, 600, 'middle')

def label(x, y, title, value, dark=False, w=210):
    fg, muted, bg, border = ('#E8EDF6', '#9BAAC1', '#192437', '#314159') if dark else ('#282730', '#63636D', '#FFFFFF', '#DCDDE4')
    return text(x, y, title, 13, muted) + rect(x, y+12, w, 42, bg, 7, border) + text(x+14, y+39, value, 15, fg)

def chart(x, y, w, h, color, dark=False):
    s = ''
    for i in range(4): s += line(x, y+i*h/3, x+w, y+i*h/3, '#29394C' if dark else '#E6E5EC')
    points = [(0,.85),(.08,.8),(.18,.82),(.25,.55),(.34,.63),(.43,.37),(.5,.43),(.6,.24),(.7,.29),(.78,.15),(.88,.2),(1,.05)]
    return s + path('M '+' L '.join(f'{x+px*w},{y+py*h}' for px,py in points), color, 3)

def shell(bg, title, subtitle, dark=False):
    fg, muted = ('#EDF2FA', '#A5B4C7') if dark else ('#282730', '#66646F')
    return rect(0, 0, 1440, 960, bg) + text(30, 45, 'flux', 34, fg, 700) + text(110, 43, 'TRAFFIC LAB', 11, muted, 600) + text(320, 42, title, 17, fg, 600) + text(30, 938, subtitle, 12, muted) + text(1410, 938, 'STATIC PROPOSAL · ILLUSTRATIVE VALUES', 11, muted, anchor='end')

def control_room():
    s = shell('#0C1422', 'A / Control Room', 'Interactive Agent-Based Traffic Simulation · synthetic research workspace', True)
    s += line(0, 72, 1440, 72, '#26354A')
    s += text(1000, 43, 'SIMULATE    EDIT    COMPARE', 12, '#A9B8CA', 600)
    s += button(1290, 22, 120, 'Export JSON', '#273750', '#EAF0FA')
    s += rect(24, 96, 254, 802, '#141F30', 12, '#2A3950') + text(44, 130, 'SCENARIO', 12, '#A5B4C7', 600)
    s += text(44, 162, 'Urban intersection', 19, '#EDF2FA', 600) + text(44, 186, 'Fixed-time signal control', 13, '#A5B4C7')
    s += label(44, 226, 'Demand per approach', '1,100 vehicles / h', True)
    s += label(44, 310, 'Observation duration', '180 seconds', True)
    s += label(44, 394, 'Random seed', '42 · reproducible', True)
    s += label(44, 478, 'Playback speed', '1×   2×   4×   8×', True)
    s += button(44, 580, 210, '▶ Run simulation', '#95E0D1', '#0B2429')
    s += button(44, 632, 100, 'Step', '#29384D', '#ECF2FC') + button(154, 632, 100, 'Reset', '#29384D', '#ECF2FC')
    s += line(44, 707, 254, 707, '#324157') + text(44, 738, 'MODEL STATUS', 12, '#A5B4C7', 600)
    s += text(44, 774, '30 Hz fixed timestep', 15, '#E8EDF6') + text(44, 803, 'Seeded Poisson arrivals', 14, '#A5B4C7') + text(44, 832, 'IDM + safe lane changes', 14, '#A5B4C7')
    s += rect(298, 96, 1118, 540, '#101C2A', 12, '#2A3950')
    for x in range(320, 1400, 40): s += line(x, 110, x, 620, '#192838')
    for y in range(120, 630, 40): s += line(310, y, 1400, y, '#192838')
    s += text(325, 130, 'NETWORK / LIVE', 12, '#ADC0D2', 600) + text(325, 158, 't = 64.0 s', 22, '#EDF2FA', 600)
    for d in ['M 370 370 L 1330 370', 'M 840 190 L 840 566']:
        s += path(d, '#273C50', 64) + path(d, '#7AB4BE', 2)
    s += line(370, 370, 1330, 370, '#BCD2DE', 1, '12 13') + line(840, 190, 840, 566, '#BCD2DE', 1, '12 13')
    s += path('M 1060 550 C 1100 470 930 370 980 210', '#000A13', 38)
    s += path('M 1060 538 C 1100 458 930 358 980 198', '#6D809B', 30) + path('M 1060 538 C 1100 458 930 358 980 198', '#DCE7F5', 1, dash='9 10')
    s += text(1010, 235, 'L1 / FLYOVER', 12, '#CBD9E8', 600)
    for x in [420, 535, 633, 708, 744, 779, 813, 990, 1160, 1250]: s += rect(x, 347, 22, 9, '#A8E9D8', 3)
    for y in [240, 280, 310, 420, 490, 530]: s += rect(850, y, 9, 22, '#A8E9D8', 3)
    s += circle(807, 330, 8, '#FDE725') + text(789, 310, 'R', 12, '#EDF2FA', 600)
    s += rect(1110, 550, 278, 62, '#182A3D', 8) + text(1126, 574, 'SPEED / POSTED LIMIT', 10, '#B6C6D8', 600)
    for i,c in enumerate(['#440154','#31688E','#21918C','#35B779','#FDE725']): s += rect(1127+i*46, 585, 46, 7, c)
    s += text(1126, 606, 'Stopped 0', 10, '#C5D4E4') + text(1369, 606, 'Free 1', 10, '#C5D4E4', anchor='end')
    for i,(name,value,unit) in enumerate([('COMPLETED','138','trips'),('MEAN TRAVEL','48.2','seconds'),('QUEUED','32','vehicles'),('MEAN SPEED','23.6','km/h')]):
        x=298+i*284; s += rect(x, 658, 266, 98, '#172436', 10) + text(x+18, 683, name, 11, '#A5B4C7', 600) + text(x+18, 728, value, 32, '#EDF2FA', 600) + text(x+130, 727, unit, 12, '#ACBBD0')
    for x,title in [(298,'CUMULATIVE THROUGHPUT · trips / h'),(868,'COMPLETED TRIP TIME · seconds')]:
        s += rect(x, 778, 548, 120, '#172436', 10) + text(x+18, 802, title, 11, '#A5B4C7', 600) + chart(x+18, 820, 508, 57, '#95E0D1', True)
    return s

def blueprint():
    s = shell('#F7F8FA', 'B / Blueprint Planner', 'Interactive Agent-Based Traffic Simulation · topology before decoration')
    s += line(0, 72, 1440, 72, '#D8DDE5') + text(940, 43, 'EDIT NETWORK     SIMULATE     COMPARE', 12, '#555F71', 600)
    s += button(1290, 22, 120, 'Export JSON', '#FFFFFF', '#254E76')
    s += rect(20, 100, 64, 656, '#FFFFFF', 10, '#DBDFE5')
    for i,(icon,caption) in enumerate([('+','Node'),('↗','Road'),('↕','Ramp'),('×','Erase')]):
        s += rect(30, 116+i*90, 44, 46, '#EAF1F8' if i==1 else '#F7F8FA', 6) + text(52, 147+i*90, icon, 24, '#254E76', 500, 'middle') + text(52, 180+i*90, caption, 10, '#556273', anchor='middle')
    s += rect(104, 100, 992, 656, '#FFFFFF', 6, '#DDE1E8')
    for x in range(120,1090,20):
        for y in range(120,750,20): s += circle(x,y,.7,'#CDD6E3')
    s += text(128, 133, 'BOTTLENECK STUDY / NETWORK 01', 12, '#53677E', 600) + text(128, 157, 'Metres · ground plan · layer 0 + layer 1', 12, '#69778A')
    for d,w in [('M 145 430 L 620 430',72),('M 620 430 L 1030 430',28),('M 620 210 L 620 675',42)]:
        s += path(d,'#DCE2E9',w+4) + path(d,'#F3F5F8',w)
    for y in [418,442]: s += line(145,y,620,y,'#A6B4C6',1,'10 10')
    s += line(620,430,1030,430,'#A6B4C6',1,'10 10') + line(620,210,620,675,'#A6B4C6',1,'10 10')
    s += path('M 620 430 L 1030 430', '#255C93', 35) + path('M 620 430 L 1030 430', '#E4EEF9', 28) + line(620,430,1030,430,'#255C93',1,'8 10')
    for x,y in [(145,430),(620,430),(1030,430),(620,210),(620,675)]: s += circle(x,y,7,'#FFFFFF','#255C93',2)
    s += line(150,365,615,365,'#7D8DA2') + line(150,357,150,373,'#7D8DA2') + line(615,357,615,373,'#7D8DA2') + text(385,352,'500 m · 3 lanes',12,'#586F89',anchor='middle')
    s += text(790, 390, 'Selected: narrow', 13, '#255C93', 600) + text(790, 482, '400 m · 1 lane · 50 km/h', 12, '#4A617D')
    for x in [220,320,410,460,500,540,575,810,930]: s += rect(x, 435 if x<600 else 423, 19, 8, '#6554A4', 2)
    s += rect(126,678,335,56,'#F8FAFC',6,'#DAE0E8') + text(140,701,'LAYER KEY',10,'#607185',600) + text(140,722,'L0 ground ━     L1 elevated ╍     ramp ↗',12,'#384F6B')
    s += button(946, 116, 128, 'Fit network', '#EEF3F9', '#254E76')
    s += rect(1116,100,304,656,'#FFFFFF',10,'#DBDFE5') + text(1138,133,'ROAD INSPECTOR',11,'#637082',600) + text(1138,166,'narrow',25,'#263A55',600)
    for y,title,value in [(209,'Lanes','1'),(293,'Speed limit','50 km/h'),(377,'Operational length','400 m'),(461,'Elevation','Ground · L0'),(545,'Geometry width','3.5 m')]: s += label(1138,y,title,value,w=258)
    s += button(1138, 640, 258, 'Apply road changes', '#255C93', '#FFFFFF') + text(1138,714,'Capacity emerges from traffic dynamics.',11,'#67768A')
    s += rect(20,778,1400,120,'#FFFFFF',10,'#DBDFE5') + text(42,804,'EXPERIMENT SNAPSHOT',11,'#627288',600)
    for x,name,value in [(42,'Active / completed','182 / 96'),(300,'Queue / pending','68 / 12'),(550,'Travel time, completed','64.8 s')]: s += text(x,837,name,12,'#647388')+text(x,874,value,28,'#253A55',600)
    s += chart(850,814,320,60,'#255C93') + button(1210,818,186,'Compare 1 vs 2 lanes','#EAF1F8','#255C93')
    return s

def iso(x,y,z=0): return (720+(x-y)*.82, 402+(x+y)*.42-z)

def polygon(points,fill,stroke='none'):
    return f'<polygon points="{" ".join(f"{x},{y}" for x,y in points)}" fill="{fill}" stroke="{stroke}"/>'

def building(x,y,w,h,height):
    a,b,c,d=[iso(px,py) for px,py in [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]]
    at,bt,ct,dt=[(px,py-height) for px,py in [a,b,c,d]]
    return polygon([(px+8,py+10) for px,py in [a,b,c,d]],'#DDD9E4')+polygon([b,c,ct,bt],'#D5D1DC')+polygon([d,c,ct,dt],'#E3DFE8')+polygon([at,bt,ct,dt],'#FCFAFD','#E7E2EB')

def layered():
    s=shell('#F1EFF4','C / Layered City','Interactive Agent-Based Traffic Simulation · same 2D physics, isometric view')
    s+=line(0,72,1440,72,'#DEDAE5')+text(1000,43,'SIMULATE    NETWORK    EXPERIMENTS',12,'#65606F',600)+button(1290,22,120,'Export JSON','#FFFFFF','#6554A4')
    s+=text(42,122,'THE EVERYDAY, IN MOTION',11,'#777180',600)+text(42,162,'Explore the flow.',34,'#282730',600)+text(42,190,'Flyover crossing · synthetic demand · seed 42',14,'#6B6574')
    # Original 2.5D geometry, without third-party scene assets.
    tr='translate(720 402) matrix(.82 .42 -.82 .42 0 0)'
    s+=f'<g transform="{tr}">'+rect(-430,-330,860,660,'#E9E6ED',18)
    for x in [-330,-180,100,260]: s+=line(x,-330,x,330,'#F7F5F9',3)
    for y in [-240,-100,130,260]: s+=line(-430,y,430,y,'#F7F5F9',3)
    s+=path('M -450 0 L 450 0','#D4D0DA',74)+path('M 0 -350 L 0 350','#D4D0DA',58)
    s+=line(-450,0,450,0,'#FDFBFF',2,'14 15')+line(0,-350,0,350,'#FDFBFF',2,'14 15')+'</g>'
    for args in [(-320,-250,100,100,50),(-200,-240,100,85,75),(110,-260,110,95,95),(260,-210,80,90,42),(-310,130,100,95,72),(-175,145,80,100,48),(130,130,90,110,78),(265,145,75,80,38)]: s+=building(*args)
    # Flyover rises above the ground plane and casts an offset shadow.
    for yy,color,sw,z in [(16,'#BDB6C8',40,0),(0,'#B2ACBE',44,42),(0,'#F9F7FC',1.4,42)]:
        a,b=iso(-450,yy,z),iso(450,yy,z); s+=line(*a,*b,color,sw,'11 13' if sw<2 else '')
    for x in [-260,-100,80,255]:
        a=iso(x,0,0); b=iso(x,0,42); s+=line(*a,*b,'#AAA3B6',7)
    for x in [-370,-260,-190,-85,80,200,315]:
        px,py=iso(x,0,42); s+=f'<g transform="translate({px} {py}) rotate(27)">'+rect(-12,-5,24,10,'#716393',4)+rect(-4,-4,8,7,'#BDB4CF',2)+'</g>'
    for y in [-270,-160,-85,85,185,285]:
        px,py=iso(0,y); s+=f'<g transform="translate({px} {py}) rotate(153)">'+rect(-11,-5,22,10,'#716393',4)+'</g>'
    px,py=iso(325,0,70); s+=rect(px-30,py-22,150,34,'#FFFFFF',9)+text(px-17,py,'L1 · Flyover',12,'#5D526E',600)
    px,py=iso(0,240); s+=rect(px-110,py+14,155,34,'#FFFFFF',9)+text(px-97,py+36,'L0 · Ground road',12,'#5D526E',600)
    s+=rect(42,230,242,308,'#FFFFFF',14,'#E0DCE6')+text(62,263,'YOUR EXPERIMENT',10,'#76707E',600)+text(62,295,'A crossing, reimagined',17,'#302B37',600)
    s+=text(62,325,'Demand',12,'#7A7381')+text(264,325,'1,950 veh/h',13,'#3B3446',600,'end')+text(62,360,'Duration',12,'#7A7381')+text(264,360,'180 s',13,'#3B3446',600,'end')
    s+=line(62,382,264,382,'#ECE8F0')+text(62,410,'LAYERS',10,'#76707E',600)+text(62,439,'☑ L0 Ground   ☑ L1 Elevated',12,'#554D61')+button(62,469,202,'▶ Run simulation','#6554A4','#FFFFFF')
    s+=rect(1165,110,235,114,'#FFFFFF',12)+text(1185,138,'VIEW CONTROLS',10,'#76707E',600)+text(1185,168,'Isometric  /  Plan',14,'#50465D',600)+text(1185,199,'−     100%     +     Fit',13,'#70677A')
    s+=rect(1110,650,290,70,'#FFFFFF',12)+text(1128,673,'SPEED / LIMIT · SYMBOL + COLOR',10,'#6B6574',600)
    for i,c in enumerate(['#440154','#31688E','#21918C','#35B779','#FDE725']): s+=rect(1128+i*49,683,49,7,c)
    s+=text(1128,708,'0 · Stopped',10,'#696171')+text(1374,708,'1 · Free',10,'#696171',anchor='end')
    s+=rect(42,767,1358,131,'#FFFFFF',16,'#E5DFEC')
    for x,label_,value,unit in [(66,'COMPLETED TRIPS','172','trips'),(330,'MEAN TRAVEL TIME','43.1','seconds'),(600,'QUEUED VEHICLES','12','incl. pending')]:
        s+=text(x,796,label_,10,'#7B7286',600)+text(x,844,value,33,'#302A38',600)+text(x,871,unit,11,'#7A7185')
    s+=text(850,796,'THROUGHPUT · TRIPS/H',10,'#7B7286',600)+chart(850,812,265,59,'#8270A2')+button(1160,805,214,'Compare at-grade ↗','#F0EDF6','#6554A4')
    return s

def svg(body, w=1440,h=960,title='Flux design proposal'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{escape(title)}"><style>text{{font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif}}</style>{body}</svg>'

designs=[('a-control-room','A · Control Room',control_room()),('b-blueprint-planner','B · Blueprint Planner',blueprint()),('c-layered-city','C · Layered City',layered())]
for slug,title,body in designs: (OUT/f'{slug}.svg').write_text(svg(body,title=title))
board=rect(0,0,1560,665,'#F8F7FA')+text(34,52,'Flux / three directions',31,'#282730',600)+text(34,84,'Choose the research workspace you want to spend time in. All values below are illustrative.',15,'#706978')
for i,(_,title,body) in enumerate(designs):
    x=34+i*510
    board+=text(x,133,title,21,'#282730',600)+f'<g transform="translate({x} 157) scale(.335)">{body}</g>'
    desc=['Dark · telemetry first · orthographic network','Light · precise editing · technical ground plan','Soft isometric · violet vehicles · visible elevation'][i]
    board+=text(x,515,desc,13,'#655E6F')
    if i==2: board+=rect(x,540,166,30,'#E9E2F4',15)+text(x+83,560,'RECOMMENDED',11,'#6554A4',600,'middle')
board+=text(34,617,'Each proposal uses the same deterministic engine and worker. This drawing is the design gate, not application UI.',14,'#706978')
(OUT/'overview.svg').write_text(svg(board,1560,665,'Flux design directions A, B and C'))
print('Wrote three original static SVG proposals and one comparison board.')
