import os from "os";
import net from "net";
import dgram from "dgram";
import fs from "fs";
import { appLogger } from "./rotatingLogger";

export interface DiscoveredMikrotik {
  id: string;
  host: string;
  port: number;
  name: string;
  version?: string;
  boardName?: string;
  mac?: string;
  interfaceName?: string;
  discoveryMethod: "MNDP" | "ARP_SCAN" | "GATEWAY_PROBE" | "DYNAMIC_INTERFACE";
  discoveredAt: string;
}

/**
 * محرك الكشف التلقائي الذكي والحي لأجهزة وراوترات مايكروتك على الشبكة الحقيقية
 * يعتمد على بروتوكول MikroTik Neighbor Discovery Protocol (MNDP / UDP 5678)
 * وجدول ARP الديناميكي للنظام، وحساب بوابات الواجهات الحية بدون أي عناوين ثابتة مسبقاً.
 */
export async function discoverMikrotikRouters(timeoutMs = 1500): Promise<DiscoveredMikrotik[]> {
  const discoveredMap = new Map<string, DiscoveredMikrotik>();

  // 1. استخراج واجهات الشبكة الحقيقية وعناوين البوابات والموجهات ديناميكياً
  const dynamicCandidateIps = new Set<string>();
  const broadcastAddresses = new Set<string>(["255.255.255.255"]);

  try {
    const interfaces = os.networkInterfaces();
    for (const [, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === "IPv4" && !addr.internal) {
          const ipParts = addr.address.split(".").map(Number);
          if (ipParts.length === 4) {
            // إضافة البوابة التقديرية للواجهة (نهاية .1 و .254)
            const prefix = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
            dynamicCandidateIps.add(`${prefix}.1`);
            dynamicCandidateIps.add(`${prefix}.254`);

            // حساب عنوان البث (Broadcast) ديناميكياً بناءً على الـ Netmask إن وجد
            if (addr.netmask) {
              const maskParts = addr.netmask.split(".").map(Number);
              if (maskParts.length === 4) {
                const bcast = ipParts.map((b, i) => (b | (~maskParts[i] & 255))).join(".");
                broadcastAddresses.add(bcast);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Discover] Failed to read network interfaces:", err);
  }

  // 2. قراءة جدول توجيه النظام وجدول ARP الديناميكي لجلب البوابات والأجهزة الحية
  try {
    if (fs.existsSync("/proc/net/route")) {
      const routeContent = fs.readFileSync("/proc/net/route", "utf8");
      const lines = routeContent.split("\n").slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const dest = parts[1];
          const gwHex = parts[2];
          // Default gateway destination is 00000000 and gateway is not 00000000
          if (dest === "00000000" && gwHex && gwHex !== "00000000" && gwHex.length === 8) {
            const b1 = parseInt(gwHex.substring(6, 8), 16);
            const b2 = parseInt(gwHex.substring(4, 6), 16);
            const b3 = parseInt(gwHex.substring(2, 4), 16);
            const b4 = parseInt(gwHex.substring(0, 2), 16);
            if (!isNaN(b1) && !isNaN(b2) && !isNaN(b3) && !isNaN(b4)) {
              dynamicCandidateIps.add(`${b1}.${b2}.${b3}.${b4}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Discover] Failed to read /proc/net/route:", err);
  }

  try {
    if (fs.existsSync("/proc/net/arp")) {
      const arpContent = fs.readFileSync("/proc/net/arp", "utf8");
      const lines = arpContent.split("\n").slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const ip = parts[0];
          const flags = parts[2];
          const mac = parts[3];
          // flag 0x2 = complete ARP entry
          if (flags === "0x2" && mac && mac !== "00:00:00:00:00:00") {
            dynamicCandidateIps.add(ip);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Discover] Failed to read /proc/net/arp:", err);
  }

  // 3. تشغيل مستمع ومكتشف بروتوكول MNDP (UDP 5678) الخاص بمايكروتك
  const runMndpListener = (): Promise<void> => {
    return new Promise((resolve) => {
      let socket: dgram.Socket | null = null;
      try {
        socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

        socket.on("message", (msg, rinfo) => {
          try {
            if (msg.length < 4) return;
            // فك ترميز حزمة MNDP TLV
            let offset = 4;
            let routerName = "";
            let version = "";
            let platform = "";
            let macStr = "";
            let iface = "";
            let reportedIp = rinfo.address;

            while (offset + 4 <= msg.length) {
              const type = msg.readUInt16BE(offset);
              const len = msg.readUInt16BE(offset + 2);
              offset += 4;

              if (offset + len > msg.length) break;
              const valBuf = msg.subarray(offset, offset + len);

              if (type === 0x0001 && len === 6) {
                macStr = Array.from(valBuf).map((b) => b.toString(16).padStart(2, "0")).join(":");
              } else if (type === 0x0005) {
                routerName = valBuf.toString("utf8");
              } else if (type === 0x0007) {
                version = valBuf.toString("utf8");
              } else if (type === 0x0008) {
                platform = valBuf.toString("utf8");
              } else if (type === 0x000b) {
                iface = valBuf.toString("utf8");
              } else if (type === 0x0010 && len === 4) {
                reportedIp = `${valBuf[0]}.${valBuf[1]}.${valBuf[2]}.${valBuf[3]}`;
              }
              offset += len;
            }

            const targetIp = reportedIp || rinfo.address;
            discoveredMap.set(targetIp, {
              id: `mndp-${targetIp}`,
              host: targetIp,
              port: 8728,
              name: routerName || `MikroTik (${targetIp})`,
              version: version || undefined,
              boardName: platform || "RouterBOARD",
              mac: macStr || undefined,
              interfaceName: iface || undefined,
              discoveryMethod: "MNDP",
              discoveredAt: new Date().toISOString()
            });
          } catch {
            // تجاوز أي حزم غير متوافقة
          }
        });

        socket.on("error", () => {
          // في حال كان المنفذ محجوزاً أو غير متاح
          resolve();
        });

        socket.bind(5678, () => {
          try {
            socket?.setBroadcast(true);
            // إرسال نداء بث لكافة عناوين البث المكتشفة
            for (const bcast of broadcastAddresses) {
              const pingBuf = Buffer.from([0x00, 0x00, 0x00, 0x01]);
              socket?.send(pingBuf, 0, pingBuf.length, 5678, bcast, () => {});
            }
          } catch {
            // تجاهل أخطاء البث
          }
        });

        setTimeout(() => {
          try {
            socket?.close();
          } catch (err: any) {
            appLogger.warn('MNDP', 'Socket close warning', { error: err?.message });
          }
          resolve();
        }, timeoutMs);
      } catch {
        resolve();
      }
    });
  };

  // 4. فحص المنافذ الحية لأجهزة المايكروتك لجميع المرشحين المستخرجين ديناميكياً
  const probeSocket = (ip: string, port: number, timeout = 700): Promise<boolean> => {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(timeout);

      const done = (open: boolean) => {
        sock.removeAllListeners();
        sock.destroy();
        resolve(open);
      };

      sock.on("connect", () => done(true));
      sock.on("error", () => done(false));
      sock.on("timeout", () => done(false));
      sock.connect(port, ip);
    });
  };

  const probeCandidate = async (ip: string) => {
    if (discoveredMap.has(ip)) return;

    // اختبار منفذ RouterOS API (8728) و Winbox (8291)
    const [apiOpen, winboxOpen] = await Promise.all([
      probeSocket(ip, 8728, 600),
      probeSocket(ip, 8291, 600)
    ]);

    if (apiOpen || winboxOpen) {
      discoveredMap.set(ip, {
        id: `probe-${ip}`,
        host: ip,
        port: apiOpen ? 8728 : 8728,
        name: `MikroTik RouterOS (${ip})`,
        boardName: "RouterBOARD",
        discoveryMethod: "DYNAMIC_INTERFACE",
        discoveredAt: new Date().toISOString()
      });
    }
  };

  // تشغيل الاستماع لـ MNDP وفحص المرشحين المستخرجين بالتوازي
  await Promise.all([
    runMndpListener(),
    Promise.all(Array.from(dynamicCandidateIps).map((ip) => probeCandidate(ip)))
  ]);

  return Array.from(discoveredMap.values());
}
