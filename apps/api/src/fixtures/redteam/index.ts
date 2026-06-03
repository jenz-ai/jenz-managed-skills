import type { RedteamFixture } from './types';
import { cleanDeployHelper } from './clean-deploy-helper';
import { awsCostExfil } from './aws-cost-exfil';
import { changelogInjection } from './changelog-injection';
import { prToolPoisoning } from './pr-tool-poisoning';
import { brandAssetsObfuscated } from './brand-assets-obfuscated';
import { devtoolsInstallerBorderline } from './devtools-installer-borderline';

export type { RedteamFixture } from './types';

/** The 6 demo attack cases, in demo order (benign control first). */
export const redteamFixtures: readonly RedteamFixture[] = [
  cleanDeployHelper,
  awsCostExfil,
  changelogInjection,
  prToolPoisoning,
  brandAssetsObfuscated,
  devtoolsInstallerBorderline,
];
