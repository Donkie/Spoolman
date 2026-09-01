import { defineConfig, tierPresets } from 'sponsorkit'
import type { Provider, Sponsorship } from 'sponsorkit'

/**
 * People who tipped on Ko-fi and asked to be credited on the sponsors board.
 * Ko-fi has no API we can query, so these are transcribed by hand from the
 * Ko-fi dashboard. A tip counts toward a tier for KOFI_TIP_EFFECTIVITY_DAYS,
 * after which the entry drops to "Past Sponsors" on its own - the same way a
 * one-time GitHub sponsorship ages out, so nothing here needs pruning.
 */
const kofiTips: KofiTip[] = [
    { login: 'marko-p', dollars: 10, date: '2026-09-01' },
]

/** Days a one-time tip keeps counting. Matches sponsorkit's own Ko-fi provider. */
const KOFI_TIP_EFFECTIVITY_DAYS = 30

interface KofiTip {
    /** GitHub login. Drives the avatar and the link on the board. */
    login: string
    /** Display name, defaults to the login. */
    name?: string
    /** Tip amount in USD. Decides the tier, see the `tiers` list below. */
    dollars: number
    /** Date of the tip, YYYY-MM-DD. */
    date: string
}

function kofiTipToSponsorship(tip: KofiTip): Sponsorship {
    const expireAt = new Date(Date.parse(tip.date) + KOFI_TIP_EFFECTIVITY_DAYS * 24 * 60 * 60 * 1000)
    return {
        sponsor: {
            type: 'User',
            login: tip.login,
            name: tip.name ?? tip.login,
            avatarUrl: `https://github.com/${tip.login}.png`,
            linkUrl: `https://github.com/${tip.login}`,
        },
        // -1 is sponsorkit's marker for a sponsorship that has run out.
        monthlyDollars: expireAt > new Date() ? tip.dollars : -1,
        isOneTime: true,
        privacyLevel: 'PUBLIC',
        tierName: 'Ko-fi',
        createdAt: new Date(tip.date).toISOString(),
        expireAt: expireAt.toISOString(),
    }
}

const KofiManualProvider: Provider = {
    name: 'kofi-manual',
    async fetchSponsors() {
        return kofiTips.map(kofiTipToSponsorship)
    },
}

export default defineConfig({
    github: {
        login: 'Donkie',
        type: 'user',
    },

    // Listing providers explicitly disables auto-detection, so GitHub has to be
    // named here alongside the hand-maintained Ko-fi list.
    providers: ['github', KofiManualProvider],

    width: 800,
    renderer: 'tiers',
    formats: ['svg', 'png'],
    // Relative to this directory. Lands next to the other README images.
    outputDir: '../media',
    name: 'sponsors',
    // Resolved against outputDir; keep the fetch cache out of the media folder.
    cacheFile: '../sponsorkit/.cache.json',

    tiers: [
        {
            title: 'Backers',
            preset: tierPresets.xs,
        },
        {
            title: 'Supporters',
            monthlyDollars: 10,
            preset: tierPresets.medium,
        },
        {
            title: 'Sponsors',
            monthlyDollars: 25,
            preset: tierPresets.large,
        },
        {
            title: 'Silver Sponsors',
            monthlyDollars: 50,
            preset: tierPresets.xl,
        },
        {
            title: 'Gold Sponsors',
            monthlyDollars: 100,
            preset: {
                ...tierPresets.xl,
                avatar: { size: 120 },
                boxWidth: 150,
                boxHeight: 160,
                name: { maxLength: 25 },
            },
        },
        {
            title: 'Past Sponsors',
            monthlyDollars: -1,
            preset: tierPresets.xs,
        },
    ],
})
