# CCNA 200-301 v1.1 exam blueprint — condensed reference (paraphrased, not verbatim)

Source: official Cisco exam topics PDF (learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf),
confirmed current as of 2024 update (v1.1, adds AI/ML/Terraform to domain 6). Used internally to
classify each bank question into one of the 6 domains — not redistributed.

## NF — 1.0 Network Fundamentals (20%)
Network component roles (routers, L2/L3 switches, NGFW/IPS, APs, WLCs, endpoints, servers, PoE) ·
topology architectures (two-tier, three-tier, spine-leaf, WAN, SOHO, on-prem/cloud) · physical
interfaces & cabling (single/multimode fiber, copper, shared vs point-to-point Ethernet) · interface/cable
issues (collisions, errors, duplex/speed mismatch) · TCP vs UDP · IPv4 addressing & subnetting · private
IPv4 addressing · IPv6 addressing & prefix · IPv6 address types (unicast global/ULA/link-local, anycast,
multicast, modified EUI-64) · client-OS IP parameters (Windows/Mac/Linux, ipconfig/ifconfig) · wireless
principles as physics/concepts (non-overlapping channels, SSID, RF, encryption — the *concept*, not
security protocols) · virtualization fundamentals (server virtualization, containers, VRFs) · switching
concepts (MAC learning/aging, frame switching/flooding, MAC address table).

## NA — 2.0 Network Access (20%)
VLANs across switches (access ports data/voice, default VLAN, inter-VLAN connectivity) · interswitch
connectivity (trunk ports, 802.1Q, native VLAN) · L2 discovery protocols (CDP, LLDP) · EtherChannel
(LACP, L2/L3) · Rapid PVST+ STP (root port/bridge, port states/roles, PortFast, root/loop guard, BPDU
filter/guard) · Cisco wireless architectures & AP modes · WLAN physical infra (AP, WLC, access/trunk
ports, LAG) · device management access (Telnet, SSH, HTTP/HTTPS, console, TACACS+/RADIUS, cloud-managed)
· wireless LAN GUI configuration (WLAN creation, security settings, QoS profiles).

## IPC — 3.0 IP Connectivity (25%)
Routing table components (protocol code, prefix, mask, next hop, administrative distance, metric,
gateway of last resort) · forwarding decision logic (longest prefix match, AD, metric) · static routing
IPv4/IPv6 (default/network/host/floating static route) · single-area OSPFv2 (neighbor adjacency,
point-to-point, broadcast DR/BDR, router ID) · first-hop redundancy protocol concepts (HSRP etc).
Also covers other IGP/EGP routing-table questions in the bank (EIGRP, BGP) as general routing-protocol
content even where not named explicitly in the current blueprint wording.

## IPS — 4.0 IP Services (10%)
Inside source NAT (static & pool) · NTP client/server · DHCP & DNS role · SNMP function · syslog
(facilities/severity) · DHCP client & relay · QoS per-hop behavior (classification, marking, queuing,
congestion, policing, shaping) · SSH remote access configuration · TFTP/FTP capabilities.

## SEC — 5.0 Security Fundamentals (15%)
Key security concepts (threats, vulnerabilities, exploits, mitigation) · security program elements
(awareness, training, physical access) · device access control via local passwords · password policy
(complexity, MFA, certificates, biometrics) · IPsec remote-access & site-to-site VPN · ACL configuration
· Layer 2 security (DHCP snooping, dynamic ARP inspection, port security) · AAA concepts (authentication/
authorization/accounting) · wireless security protocols (WPA/WPA2/WPA3) · WLAN GUI config with WPA2 PSK.

## AUT — 6.0 Automation and Programmability (10%)
Automation's impact on network management · traditional vs controller-based networking · SDN
architecture (overlay/underlay/fabric, control/data plane separation, northbound/southbound APIs) · AI
(generative/predictive) & ML in network operations · REST API characteristics (auth types, CRUD, HTTP
verbs, data encoding) · configuration management tools (Ansible, Terraform) · JSON data components.

## Classification rule
Pick the ONE domain that matches the skill actually being tested (not every keyword mentioned). A
question can mention a VLAN in passing while really testing OSPF metric comparison — classify by what's
being assessed, not by incidental nouns. If a question is genuinely borderline between two domains, note
both candidates in "note" and pick the more specific/primary one.
