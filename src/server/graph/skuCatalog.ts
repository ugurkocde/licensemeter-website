import { convertEurCents } from "~/lib/currency";

/**
 * Static catalog of common Microsoft SKUs: GUID -> friendly name + approximate
 * EUR list price. GUIDs are from Microsoft's published "Product names and
 * service plan identifiers for licensing" reference and are stable.
 *
 * Prices are estimates of public list prices (monthly, per user, annual
 * commitment). There is no Microsoft API for tenant pricing, so the per-tenant
 * price book is prefilled from these values and the customer adjusts them to
 * their agreement. Unknown SKUs fall back to a prettified part number and 0.
 *
 * `free` marks SKUs Microsoft provisions at no charge (viral, trial, developer,
 * resource account and capacity SKUs). A price of 0 on such a SKU is correct;
 * a price of 0 anywhere else means the price is unknown.
 */

export type CatalogEntry = {
  partNumber: string;
  name: string;
  defaultMonthlyPriceCents: number;
  free?: true;
};

export const SKU_CATALOG: Record<string, CatalogEntry> = {
  // Microsoft 365 / Office 365 suites
  "18181a46-0d4e-45cd-891e-60aabd171b4e": {
    partNumber: "STANDARDPACK",
    name: "Office 365 E1",
    defaultMonthlyPriceCents: 940,
  },
  "6fd2c87f-b296-42f0-b197-1e91e994b900": {
    partNumber: "ENTERPRISEPACK",
    name: "Office 365 E3",
    defaultMonthlyPriceCents: 2420,
  },
  "c7df2760-2c81-4ef7-b578-5b5392b571df": {
    partNumber: "ENTERPRISEPREMIUM",
    name: "Office 365 E5",
    defaultMonthlyPriceCents: 3970,
  },
  "05e9a617-0261-4cee-bb44-138d3ef5d965": {
    partNumber: "SPE_E3",
    name: "Microsoft 365 E3",
    defaultMonthlyPriceCents: 3670,
  },
  "06ebc4ee-1bb5-47dd-8120-11324bc54e06": {
    partNumber: "SPE_E5",
    name: "Microsoft 365 E5",
    defaultMonthlyPriceCents: 5750,
  },
  "3b555118-da6a-4418-894f-7df1e2096870": {
    partNumber: "O365_BUSINESS_ESSENTIALS",
    name: "Microsoft 365 Business Basic",
    defaultMonthlyPriceCents: 620,
  },
  "f245ecc8-75af-4f8e-b61f-27d8114de5f3": {
    partNumber: "O365_BUSINESS_PREMIUM",
    name: "Microsoft 365 Business Standard",
    defaultMonthlyPriceCents: 1300,
  },
  "cbdc14ab-d96c-4c30-b9f4-6ada7cdc1d46": {
    partNumber: "SPB",
    name: "Microsoft 365 Business Premium",
    defaultMonthlyPriceCents: 2300,
  },
  "66b55226-6b4f-492c-910c-a3b7a3c9d993": {
    partNumber: "SPE_F1",
    name: "Microsoft 365 F3",
    defaultMonthlyPriceCents: 750,
  },
  "4b585984-651b-448a-9e53-3b10f069cf7f": {
    partNumber: "DESKLESSPACK",
    name: "Office 365 F3",
    defaultMonthlyPriceCents: 400,
  },
  "dcf0408c-aaec-446c-afd4-43e3683943ea": {
    partNumber: "Microsoft_365_E3_(no_Teams)",
    name: "Microsoft 365 E3 (no Teams)",
    defaultMonthlyPriceCents: 3170,
  },
  "c2fe850d-fbbb-4858-b67d-bd0c6e746da3": {
    partNumber: "O365_w/o Teams Bundle_M3",
    name: "Microsoft 365 E3 EEA (no Teams)",
    defaultMonthlyPriceCents: 3170,
  },
  "18a4bd3f-0b5b-4887-b04f-61dd0ee15f5e": {
    partNumber: "Microsoft_365_E5_(no_Teams)",
    name: "Microsoft 365 E5 (no Teams)",
    defaultMonthlyPriceCents: 5250,
  },
  "3271cf8e-2be5-4a09-a549-70fd05baaa17": {
    partNumber: "O365_w/o_Teams_Bundle_M5",
    name: "Microsoft 365 E5 EEA (no Teams)",
    defaultMonthlyPriceCents: 5250,
  },
  "00e1ec7b-e4a3-40d1-9441-b69b597ab222": {
    partNumber: "Microsoft_365_ Business_ Premium_(no Teams)",
    name: "Microsoft 365 Business Premium (no Teams)",
    defaultMonthlyPriceCents: 2000,
  },
  "a3f586b6-8cce-4d9b-99d6-55238397f77a": {
    partNumber: "Office_365_w/o_Teams_Bundle_Business_Premium",
    name: "Microsoft 365 Business Premium EEA (no Teams)",
    defaultMonthlyPriceCents: 2000,
  },
  "b1f3042b-a390-4b56-ab61-b88e7e767a97": {
    partNumber: "Microsoft_365_Business_Basic_EEA_(no_Teams)",
    name: "Microsoft 365 Business Basic EEA (no Teams)",
    defaultMonthlyPriceCents: 470,
  },
  "b57282e3-65bd-4252-9502-c0eae1e5ab7f": {
    partNumber: "Office_365_w/o_Teams_Bundle_E1",
    name: "Office 365 E1 EEA (no Teams)",
    defaultMonthlyPriceCents: 750,
  },
  "cdd28e44-67e3-425e-be4c-737fab2899d3": {
    partNumber: "O365_BUSINESS",
    name: "Microsoft 365 Apps for business",
    defaultMonthlyPriceCents: 980,
  },
  "50f60901-3181-4b75-8a2c-4c8e4c1d5a72": {
    partNumber: "M365_F1_COMM",
    name: "Microsoft 365 F1",
    defaultMonthlyPriceCents: 210,
  },
  // GUID as returned by Graph subscribedSkus; not yet in Microsoft's reference.
  "d143ccfd-f9ba-496a-9811-a2d92654949d": {
    partNumber: "Microsoft_365_F3_(no_Teams)",
    name: "Microsoft 365 F3 (no Teams)",
    defaultMonthlyPriceCents: 650,
  },

  // Copilot
  "639dec6b-bb19-468b-871c-c5c441c4b0cb": {
    partNumber: "Microsoft_365_Copilot",
    name: "Microsoft 365 Copilot",
    defaultMonthlyPriceCents: 2810,
  },
  // GUID as returned by Graph subscribedSkus; not yet in Microsoft's reference.
  "a69133fb-7e57-40ce-9a69-6c8551bb7854": {
    partNumber: "MICROSOFT_365_COPILOT_FOR_BUSINESS",
    name: "Microsoft 365 Copilot Business",
    defaultMonthlyPriceCents: 1800,
  },

  // Security & identity
  "efccb6f7-5641-4e0e-bd10-b4976e1bf68e": {
    partNumber: "EMS",
    name: "Enterprise Mobility + Security E3",
    defaultMonthlyPriceCents: 980,
  },
  "b05e124f-c7cc-45a0-a6aa-8cf78c946968": {
    partNumber: "EMSPREMIUM",
    name: "Enterprise Mobility + Security E5",
    defaultMonthlyPriceCents: 1520,
  },
  "078d2b04-f1bd-4111-bbd4-b4b1b354cef4": {
    partNumber: "AAD_PREMIUM",
    name: "Microsoft Entra ID P1",
    defaultMonthlyPriceCents: 560,
  },
  "84a661c4-e949-4bd2-a560-ed7766fcaf2b": {
    partNumber: "AAD_PREMIUM_P2",
    name: "Microsoft Entra ID P2",
    defaultMonthlyPriceCents: 840,
  },
  "061f9ace-7d42-4136-88ac-31dc755f143f": {
    partNumber: "INTUNE_A",
    name: "Microsoft Intune Plan 1",
    defaultMonthlyPriceCents: 750,
  },
  "4ef96642-f096-40de-a3e9-d83fb2f90211": {
    partNumber: "ATP_ENTERPRISE",
    name: "Defender for Office 365 Plan 1",
    defaultMonthlyPriceCents: 190,
  },
  "3dd6cf57-d688-4eed-ba52-9e40b5468c3e": {
    partNumber: "THREAT_INTELLIGENCE",
    name: "Defender for Office 365 Plan 2",
    defaultMonthlyPriceCents: 470,
  },
  "a929cd4d-8672-47c9-8664-159c1f322ba8": {
    partNumber: "Microsoft_Intune_Suite",
    name: "Microsoft Intune Suite",
    defaultMonthlyPriceCents: 940,
  },
  "b126b073-72db-4a9d-87a4-b17afe41d4ab": {
    partNumber: "MDATP_XPLAT",
    name: "Microsoft Defender for Endpoint P2",
    defaultMonthlyPriceCents: 490,
  },
  "111046dd-295b-4d6d-9724-d52ac90bd1f2": {
    partNumber: "WIN_DEF_ATP",
    name: "Microsoft Defender for Endpoint",
    defaultMonthlyPriceCents: 490,
  },
  "26124093-3d78-432b-b5dc-48bf992543d5": {
    partNumber: "IDENTITY_THREAT_PROTECTION",
    name: "Microsoft 365 E5 Security",
    defaultMonthlyPriceCents: 1120,
  },
  "184efa21-98c3-4e5d-95ab-d07053a96e67": {
    partNumber: "INFORMATION_PROTECTION_COMPLIANCE",
    name: "Microsoft 365 E5 Compliance",
    defaultMonthlyPriceCents: 1120,
  },
  "32b47245-eb31-44fc-b945-a8b1576c439f": {
    partNumber: "SPE_F5_SECCOMP",
    name: "Microsoft 365 F5 Security + Compliance",
    defaultMonthlyPriceCents: 750,
  },
  "cf6b0d46-4093-4546-a0ab-0b1546dcc10e": {
    partNumber: "Microsoft_Entra_ID_Governance",
    name: "Microsoft Entra ID Governance",
    defaultMonthlyPriceCents: 660,
  },
  // GUID as returned by Graph subscribedSkus; not yet in Microsoft's reference.
  "f9602137-2203-447b-9fff-41b36e08ce5d": {
    partNumber: "Microsoft_Entra_Suite",
    name: "Microsoft Entra Suite",
    defaultMonthlyPriceCents: 1120,
  },

  // Workloads & add-ons
  "4b9405b0-7788-4568-add1-99614e613b69": {
    partNumber: "EXCHANGESTANDARD",
    name: "Exchange Online Plan 1",
    defaultMonthlyPriceCents: 370,
  },
  "19ec0d23-8335-4cbd-94ac-6050e30712fa": {
    partNumber: "EXCHANGEENTERPRISE",
    name: "Exchange Online Plan 2",
    defaultMonthlyPriceCents: 750,
  },
  "f8a1db68-be16-40ed-86d5-cb42ce701560": {
    partNumber: "POWER_BI_PRO",
    name: "Power BI Pro",
    defaultMonthlyPriceCents: 1310,
  },
  "53818b1b-4a27-454b-8896-0dba576410e6": {
    partNumber: "PROJECTPROFESSIONAL",
    name: "Project Plan 3",
    defaultMonthlyPriceCents: 2800,
  },
  "c5928f49-12ba-48f7-ada3-0d743a3601d5": {
    partNumber: "VISIOCLIENT",
    name: "Visio Plan 2",
    defaultMonthlyPriceCents: 1400,
  },
  "e43b5b99-8dfb-405f-9987-dc307f34bcbd": {
    partNumber: "MCOEV",
    name: "Teams Phone Standard",
    defaultMonthlyPriceCents: 750,
  },
  "0c266dff-15dd-4b49-8397-2bb16070ed52": {
    partNumber: "MCOMEETADV",
    name: "Audio Conferencing",
    defaultMonthlyPriceCents: 400,
  },
  "7e31c0d9-9551-471d-836f-32ee72be4a01": {
    partNumber: "Microsoft_Teams_Enterprise_New",
    name: "Microsoft Teams Enterprise",
    defaultMonthlyPriceCents: 500,
  },
  "7e74bd05-2c47-404e-829a-ba95c66fe8e5": {
    partNumber: "Microsoft_Teams_EEA_New",
    name: "Microsoft Teams EEA",
    defaultMonthlyPriceCents: 500,
  },
  "6432c818-bcef-43b6-9290-aec052964950": {
    partNumber: "M365_TEAMS_PREMIUM",
    name: "Microsoft Teams Premium",
    defaultMonthlyPriceCents: 940,
  },
  "36a0f3b3-adb5-49ea-bf66-762134cf063a": {
    partNumber: "Microsoft_Teams_Premium",
    name: "Microsoft Teams Premium (introductory pricing)",
    defaultMonthlyPriceCents: 660,
  },
  "52ea0e27-ae73-4983-a08f-13561ebdb823": {
    partNumber: "Teams_Premium_(for_Departments)",
    name: "Teams Premium (for Departments)",
    defaultMonthlyPriceCents: 940,
  },
  "4cde982a-ede4-4409-9ae6-b003453c8ea6": {
    partNumber: "Microsoft_Teams_Rooms_Pro",
    name: "Microsoft Teams Rooms Pro",
    defaultMonthlyPriceCents: 3750,
  },
  "21943e3a-2429-4f83-84c1-02735cd49e78": {
    partNumber: "Microsoft_Teams_Rooms_Pro_without_Audio_Conferencing",
    name: "Microsoft Teams Rooms Pro without Audio Conferencing",
    defaultMonthlyPriceCents: 3350,
  },
  "295a8eb0-f78d-45c7-8b5b-1eed5ed02dff": {
    partNumber: "MCOCAP",
    name: "Microsoft Teams Shared Devices",
    defaultMonthlyPriceCents: 750,
  },
  "b30411f5-fea1-4a59-9ad9-3db7c7ead579": {
    partNumber: "POWERAPPS_PER_USER",
    name: "Power Apps Premium",
    defaultMonthlyPriceCents: 1870,
  },
  "eda1941c-3c4f-4995-b5eb-e85a42175ab9": {
    partNumber: "POWERAUTOMATE_ATTENDED_RPA",
    name: "Power Automate Premium",
    defaultMonthlyPriceCents: 1400,
  },
  "4a51bf65-409c-4a91-b845-1121b571cc9d": {
    partNumber: "FLOW_PER_USER",
    name: "Power Automate per user",
    defaultMonthlyPriceCents: 1400,
  },
  "c1d032e0-5619-4761-9b5c-75b6831e1711": {
    partNumber: "PBI_PREMIUM_PER_USER",
    name: "Power BI Premium Per User",
    defaultMonthlyPriceCents: 2250,
  },
  "beb6439c-caad-48d3-bf46-0c82871e12be": {
    partNumber: "PROJECT_P1",
    name: "Planner Plan 1",
    defaultMonthlyPriceCents: 940,
  },
  "46102f44-d912-47e7-b0ca-1bd7b70ada3b": {
    partNumber: "PROJECT_PLAN3_DEPT",
    name: "Project Plan 3 (for Department)",
    defaultMonthlyPriceCents: 2800,
  },
  "09015f9f-377f-4538-bbb5-f75ceb09358a": {
    partNumber: "PROJECTPREMIUM",
    name: "Project Plan 5",
    defaultMonthlyPriceCents: 5160,
  },
  "4b244418-9658-4451-a2b8-b5e2b364e9bd": {
    partNumber: "VISIOONLINE_PLAN1",
    name: "Visio Plan 1",
    defaultMonthlyPriceCents: 470,
  },

  // Windows 365 Enterprise Cloud PCs (sizes seen on real tenants)
  "7bb14422-3b90-4389-a7be-f1b745fc037f": {
    partNumber: "CPC_E_2C_4GB_64GB",
    name: "Windows 365 Enterprise 2 vCPU 4 GB 64 GB",
    defaultMonthlyPriceCents: 2900,
  },
  "226ca751-f0a4-4232-9be5-73c02a92555e": {
    partNumber: "CPC_E_2C_4GB_128GB",
    name: "Windows 365 Enterprise 2 vCPU 4 GB 128 GB",
    defaultMonthlyPriceCents: 3300,
  },
  "e2aebe6c-897d-480f-9d62-fff1381581f7": {
    partNumber: "CPC_E_2C_8GB_128GB",
    name: "Windows 365 Enterprise 2 vCPU 8 GB 128 GB",
    defaultMonthlyPriceCents: 3700,
  },
  "d201f153-d3b2-4057-be2f-fe25c8983e6f": {
    partNumber: "CPC_E_4C_16GB_128GB",
    name: "Windows 365 Enterprise 4 vCPU 16 GB 128 GB",
    defaultMonthlyPriceCents: 5400,
  },
  "96d2951e-cb42-4481-9d6d-cad3baac177e": {
    partNumber: "CPC_E_4C_16GB_256GB",
    name: "Windows 365 Enterprise 4 vCPU 16 GB 256 GB",
    defaultMonthlyPriceCents: 6100,
  },
  "c97d00e4-0c4c-4ec2-a016-9448c65de986": {
    partNumber: "CPC_E_8C_32GB_128GB",
    name: "Windows 365 Enterprise 8 vCPU 32 GB 128 GB",
    defaultMonthlyPriceCents: 9000,
  },
  "7818ca3e-73c8-4e49-bc34-1276a2d27918": {
    partNumber: "CPC_E_8C_32GB_256GB",
    name: "Windows 365 Enterprise 8 vCPU 32 GB 256 GB",
    defaultMonthlyPriceCents: 9900,
  },
  "9fb0ba5f-4825-4e84-b239-5167a3a5d4dc": {
    partNumber: "CPC_E_8C_32GB_512GB",
    name: "Windows 365 Enterprise 8 vCPU 32 GB 512 GB",
    defaultMonthlyPriceCents: 11500,
  },

  // Dynamics 365
  "2edaa1dc-966d-4475-93d6-8ee8dfd96877": {
    partNumber: "DYN365_SALES_PREMIUM",
    name: "Dynamics 365 Sales Premium",
    defaultMonthlyPriceCents: 12600,
  },
  "1e1a282c-9c54-43a2-9310-98ef728faace": {
    partNumber: "DYN365_ENTERPRISE_SALES",
    name: "Dynamics 365 Sales Enterprise",
    defaultMonthlyPriceCents: 8800,
  },
  "749742bf-0d37-4158-a120-33567104deeb": {
    partNumber: "DYN365_ENTERPRISE_CUSTOMER_SERVICE",
    name: "Dynamics 365 Customer Service Enterprise",
    defaultMonthlyPriceCents: 8800,
  },
  "7ac9fe77-66b7-4e5e-9e46-10eed1cff547": {
    partNumber: "DYN365_TEAM_MEMBERS",
    name: "Dynamics 365 Team Members",
    defaultMonthlyPriceCents: 750,
  },
  "2880026b-2b0c-4251-8656-5d41ff11e3aa": {
    partNumber: "DYN365_BUSCENTRAL_ESSENTIAL",
    name: "Dynamics 365 Business Central Essentials",
    defaultMonthlyPriceCents: 6000,
  },
  "f991cecc-3f91-4cd0-a9a8-bf1c8167e029": {
    partNumber: "DYN365_BUSCENTRAL_PREMIUM",
    name: "Dynamics 365 Business Central Premium",
    defaultMonthlyPriceCents: 9000,
  },
  "2e3c4023-80f6-4711-aa5d-29e0ecb46835": {
    partNumber: "DYN365_BUSCENTRAL_TEAM_MEMBER",
    name: "Dynamics 365 Business Central Team Members",
    defaultMonthlyPriceCents: 700,
  },

  // Known free: viral, trial, developer, resource and capacity SKUs that
  // Microsoft provisions at no charge. They are never waste and their seats
  // never count as purchases.
  "f30db892-07e9-47e9-837c-80727f46fd3d": {
    partNumber: "FLOW_FREE",
    name: "Power Automate Free",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "6470687e-a428-4b7a-bef2-8a291ad947c9": {
    partNumber: "WINDOWS_STORE",
    name: "Windows Store for Business",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "a403ebcc-fae0-4ca2-8c8c-7a907fd6c235": {
    partNumber: "POWER_BI_STANDARD",
    name: "Microsoft Fabric (Free)",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "5b631642-bd26-49fe-bd20-1daaa972ef80": {
    partNumber: "POWERAPPS_DEV",
    name: "Power Apps for Developer",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "dcb1a3ae-b33f-4487-846a-a640262fadf4": {
    partNumber: "POWERAPPS_VIRAL",
    name: "Power Apps Plan 2 Trial",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "87bbbc60-4754-4998-8c88-227dca264858": {
    partNumber: "POWERAPPS_INDIVIDUAL_USER",
    name: "Power Apps and Logic Flows",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "bf666882-9c9b-4b2e-aa2f-4789b0a52ba2": {
    partNumber: "POWERAPPS_PER_APP_IW",
    name: "Power Apps per app baseline access",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "606b54a9-78d8-4298-ad8b-df6ef4481c80": {
    partNumber: "CCIBOTS_PRIVPREV_VIRAL",
    name: "Copilot Studio Viral Trial",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "3f9f06f5-3c31-472c-985f-62d9c10ec167": {
    partNumber: "Power_Pages_vTrial_for_Makers",
    name: "Power Pages vTrial for Makers",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "1f2f344a-700d-42c9-9427-5cea1d5d7ba6": {
    partNumber: "STREAM",
    name: "Microsoft Stream",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "093e8d14-a334-43d9-93e3-30589a8b47d0": {
    partNumber: "RMSBASIC",
    name: "Rights Management Service Basic Content Protection",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "8c4ce438-32a7-4ac5-91a6-e22ae08d9c8b": {
    partNumber: "RIGHTSMANAGEMENT_ADHOC",
    name: "Rights Management Adhoc",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "8f0c5670-4e56-4892-b06d-91c085d7004f": {
    partNumber: "SPZA_IW",
    name: "App Connect IW",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "6a4a1628-9b9a-424d-bed5-4118f0ede3fd": {
    partNumber: "PROJECT_MADEIRA_PREVIEW_IW_SKU",
    name: "Dynamics 365 Business Central for IWs",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "338148b6-1b11-4102-afb9-f92b6cdc0f8d": {
    partNumber: "DYN365_ENTERPRISE_P1_IW",
    name: "Dynamics 365 P1 Trial for Information Workers",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "61e6bd70-fbdb-4deb-82ea-912842f39431": {
    partNumber: "DYN365_AI_SERVICE_INSIGHTS",
    name: "Dynamics 365 Customer Service Insights Trial",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "bc946dac-7877-4271-b2f7-99d2db13cd2c": {
    partNumber: "FORMS_PRO",
    name: "Dynamics 365 Customer Voice Trial",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "726a0894-2c77-4d65-99da-9775ef05aad1": {
    partNumber: "MICROSOFT_BUSINESS_CENTER",
    name: "Microsoft Business Center",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "9c0587f3-8665-4252-a8ad-b7a5ade57312": {
    partNumber: "Microsoft365_Lighthouse",
    name: "Microsoft 365 Lighthouse",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "440eaaa8-b3e0-484b-a8be-62870b9ba70a": {
    partNumber: "PHONESYSTEM_VIRTUALUSER",
    name: "Microsoft Teams Phone Resource Account",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "0e142028-345e-45da-8d92-8bfd4093bbb9": {
    partNumber: "PHONESYSTEM_VIRTUALUSER_FACULTY",
    name: "Microsoft Teams Phone Resource Account for Faculty",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "6af4b3d6-14bb-4a2a-960c-6c902aad34f3": {
    partNumber: "Microsoft_Teams_Rooms_Basic",
    name: "Microsoft Teams Rooms Basic",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "710779e8-3d4a-4c88-adb9-386c958d1fdf": {
    partNumber: "TEAMS_EXPLORATORY",
    name: "Microsoft Teams Exploratory",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
  "29a2f828-8f39-4837-b8ff-c957e86abe3c": {
    partNumber: "TEAMS_COMMERCIAL_TRIAL",
    name: "Microsoft Teams Commercial Cloud",
    defaultMonthlyPriceCents: 0,
    free: true,
  },
};

/**
 * Graph returns some part numbers with zero-width characters (seen on Windows
 * 365 CPC_* SKUs), which break display and matching. Stripped at ingest.
 */
export const cleanPartNumber = (partNumber: string): string =>
  partNumber.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").trim();

/**
 * Free SKUs the catalog has no GUID for: viral and trial offers and partner
 * sandboxes follow these naming conventions across every Microsoft product.
 */
const FREE_PART_NUMBER_PATTERN =
  /viral|vtrial|(^|_)trial($|_)|partner_sandbox/i;

const FREE_PART_NUMBERS = new Set(
  Object.values(SKU_CATALOG)
    .filter((e) => e.free)
    .map((e) => e.partNumber.toLowerCase()),
);

/**
 * True when the SKU is known to cost nothing: flagged free in the catalog (by
 * GUID or part number) or named like a viral, trial or partner sandbox offer.
 * Unknown SKUs are not free; they are merely unpriced.
 */
export const isKnownFreeSku = (
  skuId: string | null,
  partNumber?: string | null,
): boolean => {
  if (skuId && SKU_CATALOG[skuId]?.free) return true;
  if (!partNumber) return false;
  const part = cleanPartNumber(partNumber);
  return (
    FREE_PART_NUMBERS.has(part.toLowerCase()) ||
    FREE_PART_NUMBER_PATTERN.test(part)
  );
};

const prettifyPartNumber = (partNumber: string): string =>
  partNumber
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) =>
      w.length > 3 ? w[0]!.toUpperCase() + w.slice(1) : w.toUpperCase(),
    )
    .join(" ");

export const skuDisplayName = (
  skuId: string,
  partNumber?: string | null,
): string => {
  const entry = SKU_CATALOG[skuId];
  if (entry) return entry.name;
  if (partNumber) return prettifyPartNumber(partNumber);
  return skuId;
};

export const skuDefaultPriceCents = (
  skuId: string,
  currencyRatePpm = 1_000_000,
): number =>
  convertEurCents(
    SKU_CATALOG[skuId]?.defaultMonthlyPriceCents ?? 0,
    currencyRatePpm,
  );

/**
 * Friendly names of the service plans admins most often switch off inside the
 * suites, from Microsoft's licensing reference (service plan id -> name).
 * Used to name disabled plans in downgrade hints; unknown ids stay ids.
 */
export const SERVICE_PLAN_NAMES: Record<string, string> = {
  "57ff2da0-773e-42df-b2af-ffb7a2317929": "Microsoft Teams",
  "efb87545-963c-4e0d-99df-69c6916d9eb0": "Exchange Online (Plan 2)",
  "9aaf7827-d63c-4b61-89c3-182f06f82e5c": "Exchange Online (Plan 1)",
  "5dbe027f-2339-4123-9542-606e4d348a72": "SharePoint (Plan 2)",
  "c7699d2e-19aa-44de-8edf-1736da088ca1": "SharePoint (Plan 1)",
  "43de0ff5-c92c-492b-9116-175376d08c38": "Microsoft 365 Apps for enterprise",
  "094e7854-93fc-4d55-b2c0-3ab5369ebdc1": "Microsoft 365 Apps for business",
  "e95bec33-7c88-4a70-8e19-b10bd9d0c014": "Office for the Web",
  "7547a3fe-08ee-4ccb-b430-5077c5041653": "Yammer Enterprise",
  "a82fbf69-b4d7-49f4-83a6-915b2cf354f4": "Viva Engage Core",
  "a23b959c-7ce8-4e57-9140-b90eb88a9e97": "Sway",
  "2789c901-c14e-48ab-a76a-be334d9d793a": "Microsoft Forms (Plan E3)",
  "e212cbc7-0961-4c40-9825-01117710dcb1": "Microsoft Forms (Plan E5)",
  "9e700747-8b1d-45e5-ab8d-ef187ceec156": "Microsoft Stream for Office 365 E3",
  "6c6042f5-6f01-4d67-b8c1-eb99d36eed3e": "Microsoft Stream for Office 365 E5",
  "b737dad2-2f6c-4c65-90e3-ca563267e8b9": "Microsoft Planner",
  "c87f142c-d1e9-4363-8630-aaea9c4d9ae5": "To-Do (Plan 2)",
  "3fb82609-8c27-4f7b-bd51-30634711ee67": "To-Do (Plan 3)",
  "94a54592-cd8b-425e-87c6-97868b000b91": "Whiteboard (Plan 2)",
  "4a51bca5-1eff-43f5-878c-177680f191af": "Whiteboard (Plan 3)",
  "199a5c09-e0ca-4e37-8f7c-b05d533e1ea2": "Microsoft Bookings",
  "54fc630f-5a40-48ee-8965-af0503c1386e": "Microsoft Kaizala Pro",
  "aebd3021-9f8f-4bf8-bbe3-0ed2f4f047a1": "Microsoft Kaizala Pro",
  "c68f8d98-5534-41c8-bf36-22fa496fa792": "Power Apps for Office 365",
  "9c0dab89-a30c-4117-86e7-97bda240acd2": "Power Apps for Office 365 (Plan 3)",
  "76846ad7-7776-4c40-a281-a386362dd1b9": "Power Automate for Office 365",
  "07699545-9485-468e-95b6-2fca3738be01": "Power Automate for Office 365",
  "70d33638-9c74-4d01-bfd3-562de28bd4ba": "Power BI Pro",
  "4828c8ec-dc2e-4779-b502-87ac9ce28ab7": "Microsoft 365 Phone System",
  "3e26ee1f-8a5f-4d52-aee2-b81ce45c8f40": "Microsoft 365 Audio Conferencing",
  "0feaeb32-d00e-4d66-bd5a-43b5b83db82c": "Skype for Business Online (Plan 2)",
  "f20fedf3-f3c3-43c3-8267-2bfdd51c0939":
    "Microsoft Defender for Office 365 (Plan 1)",
  "8e0c0a52-6a6c-4d40-8370-dd62790dcd70":
    "Microsoft Defender for Office 365 (Plan 2)",
  "871d91ec-ec1a-452b-a83f-bd76c7d770ef": "Microsoft Defender for Endpoint",
  "14ab5db5-e6c4-4b20-b4bc-13e36fd2227f": "Microsoft Defender for Identity",
  "2e2ddb96-6af9-4b1d-a3f0-d6ecfd22edb2": "Microsoft Defender for Cloud Apps",
  "c1ec4a95-1f05-45b3-a911-aa3fa01094f5": "Microsoft Intune Plan 1",
  "41781fb2-bc02-4b7c-bd55-b576c07bb09d": "Microsoft Entra ID P1",
  "eec0eb4f-6444-4f95-aba0-50c24d67f998": "Microsoft Entra ID P2",
  "31b4e2fc-4cd6-4e7d-9c1b-41407303bd66": "Project for Office (Plan E3)",
  "b21a6b06-1988-436e-a07b-51ec6d9f52ad": "Project for Office (Plan E5)",
  "c4b8c31a-fb44-4c65-9837-a21f55fcabda": "Microsoft Loop",
  "a1ace008-72f3-4ea0-8dac-33b3a23a2472": "Microsoft Clipchamp",
  "33c4f319-9bdd-48d6-9c4d-410b750a4a5a": "Insights by MyAnalytics",
  "b76fb638-6ba6-402a-b9f9-83d28acb3d86": "Viva Learning Seeded",
  "21b439ba-a0ca-424f-a6cc-52f954a5b111": "Windows 10/11 Enterprise",
  "8e229017-d77b-43d5-9305-903395523b99": "Windows 10/11 Business",
};
